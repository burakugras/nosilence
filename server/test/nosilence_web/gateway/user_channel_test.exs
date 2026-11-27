# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.UserChannelTest do
  # Channel processes run outside the test process, so the database is shared.
  use NosilenceWeb.ChannelCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Communities, Messaging}
  alias NosilenceWeb.Gateway.Socket

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner, "Club")
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  defp join_own(user) do
    {:ok, socket} = connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(user)})
    {:ok, _, socket} = subscribe_and_join(socket, "user:" <> user.id, %{})
    socket
  end

  test "only the user can join their own topic", %{owner: owner, member: member} do
    {:ok, socket} = connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(member)})
    assert {:error, _} = subscribe_and_join(socket, "user:" <> owner.id, %{})
  end

  test "others' messages in any of the user's communities are pushed with names", ctx do
    join_own(ctx.member)
    {:ok, _} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hi")

    assert_push "notify", %{
      community_name: "Club",
      channel_name: "general",
      author_name: "Owner",
      text: "hi"
    }

    # Not the user's own messages.
    {:ok, _} = Messaging.send_message(ctx.member, ctx.text_channel.id, "mine")
    refute_push "notify", %{text: "mine"}
  end

  test "a community joined later is followed; a removed member hears nothing more", ctx do
    socket = join_own(ctx.member)
    other = community_fixture(ctx.owner, "Second")
    :ok = join_fixture(ctx.owner, other.community, ctx.member)
    # The join is followed through the user's topic.
    _ = :sys.get_state(socket.channel_pid)

    {:ok, _} = Messaging.send_message(ctx.owner, other.text_channel.id, "welcome")
    assert_push "notify", %{community_name: "Second", text: "welcome"}

    {:ok, _} = Communities.remove_member(ctx.owner, ctx.community.id, ctx.member.id)
    _ = :sys.get_state(socket.channel_pid)
    {:ok, _} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "secret")
    refute_push "notify", %{text: "secret"}
  end

  test "renamed channels are shown with their new name", ctx do
    socket = join_own(ctx.member)
    {:ok, _} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "one")
    assert_push "notify", %{channel_name: "general"}

    {:ok, _} = Communities.rename_channel(ctx.owner, ctx.text_channel.id, "news")
    _ = :sys.get_state(socket.channel_pid)
    {:ok, _} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "two")
    assert_push "notify", %{channel_name: "news", text: "two"}
  end

  test "notifications say whether the user was mentioned (ADR 0017)", ctx do
    join_own(ctx.member)
    ch = ctx.text_channel.id
    {:ok, _} = Messaging.send_message(ctx.owner, ch, "plain")
    assert_push "notify", %{text: "plain", mentioned: false}

    {:ok, _} = Messaging.send_message(ctx.owner, ch, "hi", %{"mentions" => [ctx.member.id]})
    assert_push "notify", %{text: "hi", mentioned: true}

    {:ok, _} = Messaging.send_message(ctx.owner, ch, "all", %{"mention" => "everyone"})
    assert_push "notify", %{text: "all", mentioned: true}
  end

  describe "notification levels and friends' status (ADR 0018)" do
    test "a community set to nothing sends only messages that mention the user", ctx do
      join_own(ctx.member)

      :ok =
        Nosilence.NotificationSettings.put(ctx.member, "community", ctx.community.id, %{
          "level" => "none"
        })

      assert_push "notification_settings_changed", %{}
      ch = ctx.text_channel.id
      {:ok, _} = Messaging.send_message(ctx.owner, ch, "quiet")
      refute_push "notify", %{text: "quiet"}

      {:ok, _} = Messaging.send_message(ctx.owner, ch, "hey", %{"mentions" => [ctx.member.id]})
      assert_push "notify", %{text: "hey", mentioned: true}
    end

    test "friends see each other's status live; nobody else does", ctx do
      alias Nosilence.{Profiles, Social}

      for {u, name} <- [{ctx.owner, "owner"}, {ctx.member, "member"}],
          do: {:ok, _} = Social.set_username(u, name)

      {:ok, :requested} = Social.request_friend(ctx.owner, "member")
      :ok = Social.accept_friend(ctx.member, ctx.owner.id)
      stranger = confirmed_user_fixture()
      owner_id = ctx.owner.id
      member_id = ctx.member.id
      stranger_id = stranger.id

      join_own(ctx.owner)
      assert_push "friends_presence", %{presence: presence}
      assert presence == %{}

      join_own(ctx.member)
      # The newcomer learns the owner is online, and the owner learns about them.
      assert_push "friends_presence", %{presence: %{^owner_id => [%{status: "online"}]}}
      assert_push "friend_presence", %{user_id: ^member_id, metas: [%{status: "online"}]}

      join_own(stranger)
      refute_push "friend_presence", %{user_id: ^stranger_id}

      member = Nosilence.Repo.get!(Nosilence.Accounts.User, member_id)
      {:ok, member} = Profiles.set_status(member, %{"status" => "dnd", "text" => "Away"})

      assert_push "friend_presence", %{
        user_id: ^member_id,
        metas: [%{status: "dnd", status_text: "Away"}]
      }

      {:ok, _} = Profiles.set_status(member, %{"status" => "invisible"})
      assert_push "friend_presence", %{user_id: ^member_id, metas: []}
    end
  end
end
