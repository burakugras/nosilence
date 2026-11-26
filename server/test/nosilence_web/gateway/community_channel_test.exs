# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.CommunityChannelTest do
  # Channel processes run outside the test process, so the database is shared.
  use NosilenceWeb.ChannelCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Communities, Messaging}
  alias NosilenceWeb.Gateway.Socket

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  defp connect_as(user) do
    {:ok, socket} = connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(user)})
    socket
  end

  defp join_community(user, community) do
    {:ok, _, socket} =
      user |> connect_as() |> subscribe_and_join("community:" <> community.id, %{})

    socket
  end

  describe "connecting" do
    test "needs a valid ticket", %{owner: owner} do
      assert {:ok, socket} =
               connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(owner)})

      assert socket.assigns.user.id == owner.id
      assert Socket.id(socket) == "user_socket:" <> owner.id
      assert :error = connect(Socket, %{}, connect_info: %{auth_token: "forged"})
      assert :error = connect(Socket, %{}, connect_info: %{})
      # A ticket in the URL is not accepted.
      assert :error = connect(Socket, %{"token" => Socket.sign_ticket(owner)})
    end

    test "the endpoint reads the ticket from the handshake header and checks the Origin" do
      [{"/socket", NosilenceWeb.Gateway.Socket, opts}] = NosilenceWeb.Endpoint.__sockets__()
      assert opts[:auth_token] == true
      assert opts[:longpoll] == false
      assert NosilenceWeb.Endpoint.allowed_origin?(URI.parse("http://app.test"))
      refute NosilenceWeb.Endpoint.allowed_origin?(URI.parse("http://evil.test"))
      refute NosilenceWeb.Endpoint.allowed_origin?(URI.parse("https://app.test"))
    end

    test "tickets expire after 60 seconds", %{owner: owner} do
      old =
        Phoenix.Token.sign(NosilenceWeb.Endpoint, "gateway socket", owner.id,
          signed_at: System.system_time(:second) - 61
        )

      assert :error = connect(Socket, %{}, connect_info: %{auth_token: old})
    end
  end

  test "strangers cannot join a community's topic", %{community: c} do
    socket = connect_as(confirmed_user_fixture())

    assert {:error, %{reason: "not_found"}} =
             subscribe_and_join(socket, "community:" <> c.id, %{})

    assert {:error, %{reason: "not_found"}} =
             subscribe_and_join(socket, "community:not-a-uuid", %{})
  end

  test "members appear in presence, with their voice channel", ctx do
    socket = join_community(ctx.member, ctx.community)
    assert_push "presence_state", %{}
    member_id = ctx.member.id

    assert_broadcast "presence_diff", %{
      joins: %{^member_id => %{metas: [%{voice_channel_id: nil}]}}
    }

    ref = push(socket, "voice_join", %{"channel_id" => ctx.channel.id})
    assert_reply ref, :ok
    voice_id = ctx.channel.id

    assert_broadcast "presence_diff", %{
      joins: %{^member_id => %{metas: [%{voice_channel_id: ^voice_id, display_name: "Member"}]}}
    }

    ref = push(socket, "voice_leave", %{})
    assert_reply ref, :ok

    assert_broadcast "presence_diff", %{
      joins: %{^member_id => %{metas: [%{voice_channel_id: nil}]}}
    }
  end

  test "voice presence only accepts this community's voice channels", ctx do
    socket = join_community(ctx.owner, ctx.community)
    other = community_fixture(ctx.owner, "Other")

    for channel_id <- [other.channel.id, ctx.text_channel.id, "nonsense"] do
      ref = push(socket, "voice_join", %{"channel_id" => channel_id})
      assert_reply ref, :error, %{reason: "not_found"}
    end
  end

  test "new messages are pushed to members", ctx do
    join_community(ctx.owner, ctx.community)
    {:ok, m} = Messaging.send_message(ctx.member, ctx.text_channel.id, "hello")
    message_id = m.id
    assert_push "message_created", %{id: ^message_id, text: "hello"}
  end

  test "new members and new channels are pushed to members", ctx do
    join_community(ctx.owner, ctx.community)
    newcomer = confirmed_user_fixture(%{"display_name" => "Newcomer"})
    :ok = join_fixture(ctx.owner, ctx.community, newcomer)
    newcomer_id = newcomer.id
    assert_push "member_joined", %{user_id: ^newcomer_id, display_name: "Newcomer"}

    # Accepting again as a member is not a new join.
    {:ok, token, _} = Communities.create_invite(ctx.owner, ctx.community.id)
    {:ok, _} = Communities.accept_invite(newcomer, token)
    refute_push "member_joined", _

    {:ok, _} =
      Communities.create_channel(ctx.owner, ctx.community.id, %{
        "name" => "news",
        "kind" => "text"
      })

    assert_push "channel_created", %{name: "news", kind: "text", capacity: nil}
  end

  test "a removed member is disconnected at once; others are told", ctx do
    owner_socket = join_community(ctx.owner, ctx.community)
    member_socket = join_community(ctx.member, ctx.community)
    Process.unlink(member_socket.channel_pid)
    monitor = Process.monitor(member_socket.channel_pid)

    {:ok, _} = Communities.remove_member(ctx.owner, ctx.community.id, ctx.member.id)

    assert_push "removed", %{}
    assert_receive {:DOWN, ^monitor, _, _, _}
    member_id = ctx.member.id
    assert_push "member_removed", %{user_id: ^member_id}
    assert Process.alive?(owner_socket.channel_pid)

    # Nothing more reaches the removed member.
    {:ok, _} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "after")
    assert_push "message_created", %{text: "after"}
    refute_push "message_created", %{text: "after"}
  end

  test "deleting the community disconnects everyone", ctx do
    socket = join_community(ctx.member, ctx.community)
    Process.unlink(socket.channel_pid)
    monitor = Process.monitor(socket.channel_pid)

    {:ok, _} = Communities.delete_community(ctx.owner, ctx.community.id)
    assert_push "removed", %{}
    assert_receive {:DOWN, ^monitor, _, _, _}
  end

  describe "profile and status in presence (ADR 0017)" do
    test "picture version, status, idle and live changes", ctx do
      {:ok, _} = Nosilence.Profiles.set_status(ctx.member, %{"status" => "dnd", "text" => "Busy"})
      socket = join_community(ctx.member, ctx.community)
      member_id = ctx.member.id

      assert_broadcast "presence_diff", %{
        joins: %{
          ^member_id => %{
            metas: [%{status: "dnd", status_text: "Busy", avatar: nil, idle: false}]
          }
        }
      }

      ref = push(socket, "activity", %{"idle" => true})
      assert_reply ref, :ok
      assert_broadcast "presence_diff", %{joins: %{^member_id => %{metas: [%{idle: true}]}}}

      # A change made elsewhere (another device) reaches this connection.
      member = Nosilence.Repo.get!(Nosilence.Accounts.User, member_id)
      {:ok, _} = Nosilence.Profiles.set_avatar(member, Nosilence.WebpFixtures.lossless())
      assert_broadcast "presence_diff", %{joins: %{^member_id => %{metas: [%{avatar: 1}]}}}

      ref = push(socket, "activity", %{"idle" => "yes"})
      assert_reply ref, :error
    end

    test "invisible people are not online; in voice they show as offline", ctx do
      {:ok, _} = Nosilence.Profiles.set_status(ctx.member, %{"status" => "invisible"})
      socket = join_community(ctx.member, ctx.community)
      member_id = ctx.member.id
      _ = :sys.get_state(socket.channel_pid)
      refute Map.has_key?(NosilenceWeb.Gateway.Presence.list(socket), member_id)

      ref = push(socket, "voice_join", %{"channel_id" => ctx.channel.id})
      assert_reply ref, :ok

      assert_broadcast "presence_diff", %{
        joins: %{^member_id => %{metas: [%{status: "offline", status_text: nil}]}}
      }

      ref = push(socket, "voice_leave", %{})
      assert_reply ref, :ok
      assert_broadcast "presence_diff", %{leaves: %{^member_id => _}}

      # Becoming visible again shows them at once.
      member = Nosilence.Repo.get!(Nosilence.Accounts.User, member_id)
      {:ok, _} = Nosilence.Profiles.set_status(member, %{"status" => "online"})
      assert_broadcast "presence_diff", %{joins: %{^member_id => %{metas: [%{status: "online"}]}}}
    end
  end
end
