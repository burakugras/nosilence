# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.VoiceChannelTest do
  use NosilenceWeb.ChannelCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.Communities
  alias NosilenceWeb.Gateway.Socket

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  defp socket_for(user) do
    {:ok, socket} = connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(user)})
    socket
  end

  defp join_voice(user, channel, key_package \\ "key package") do
    user
    |> socket_for()
    |> subscribe_and_join("voice:" <> channel.id, %{"key_package" => Base.encode64(key_package)})
  end

  test "only members join, only voice channels, only with a key package", ctx do
    assert {:error, %{reason: "not_found"}} = join_voice(confirmed_user_fixture(), ctx.channel)
    assert {:error, %{reason: "not_found"}} = join_voice(ctx.owner, ctx.text_channel)

    assert {:error, %{reason: "not_found"}} =
             ctx.owner
             |> socket_for()
             |> subscribe_and_join("voice:" <> ctx.channel.id, %{"key_package" => "%%%"})

    too_big = :binary.copy("x", 5_000)
    assert {:error, %{reason: "not_found"}} = join_voice(ctx.owner, ctx.channel, too_big)
  end

  test "messages flow: create, add with Welcome, removal on losing access", ctx do
    assert {:ok, %{action: "create", group_id: group_id}, owner_socket} =
             join_voice(ctx.owner, ctx.channel)

    assert {:ok, %{action: "wait", group_id: ^group_id}, member_socket} =
             join_voice(ctx.member, ctx.channel, "member kp")

    member_id = ctx.member.id
    kp = Base.encode64("member kp")

    assert_push "commit_request", %{op: "add", user_id: ^member_id, epoch: 0, key_package: ^kp}

    ref =
      push(owner_socket, "commit", %{
        "epoch" => 0,
        "commit" => Base.encode64("c1"),
        "welcome" => Base.encode64("w1")
      })

    assert_reply ref, :ok
    welcome = Base.encode64("w1")
    assert_push "welcome", %{epoch: 1, welcome: ^welcome, group_id: ^group_id}

    ref = push(owner_socket, "commit", %{"epoch" => 0, "commit" => Base.encode64("again")})
    assert_reply ref, :error, %{reason: "stale"}

    # The owner removes the member: their voice session ends and the owner is
    # asked to take them out of the group, which changes the key.
    Process.unlink(member_socket.channel_pid)
    {:ok, _} = Communities.remove_member(ctx.owner, ctx.community.id, ctx.member.id)
    assert_push "removed", %{}
    assert_push "commit_request", %{op: "remove", user_id: ^member_id, epoch: 1}
  end
end
