# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.MessageControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.LiveKitStub

  alias Nosilence.Accounts

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(NosilenceWeb.UserAuth.cookie_name(), Accounts.create_session(user))
  end

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  test "send, list and delete messages", %{text_channel: ch} = ctx do
    sent = authed(ctx.member) |> post(~p"/api/channels/#{ch.id}/messages", %{text: "hi there"})

    assert %{
             "message" => %{
               "id" => id,
               "text" => "hi there",
               "author" => %{"display_name" => "Member"}
             }
           } =
             json_response(sent, 201)

    listed = authed(ctx.owner) |> get(~p"/api/channels/#{ch.id}/messages")
    assert %{"messages" => [%{"id" => ^id}], "has_more" => false} = json_response(listed, 200)

    assert authed(ctx.owner) |> delete(~p"/api/messages/#{id}") |> response(204)

    assert %{"messages" => []} =
             json_response(authed(ctx.owner) |> get(~p"/api/channels/#{ch.id}/messages"), 200)
  end

  test "read position: the channel list shows unread counts, reading clears them",
       %{text_channel: ch} = ctx do
    sent = authed(ctx.owner) |> post(~p"/api/channels/#{ch.id}/messages", %{text: "news"})
    %{"message" => %{"id" => id, "seq" => seq}} = json_response(sent, 201)
    assert is_integer(seq)

    shown = authed(ctx.member) |> get(~p"/api/communities/#{ctx.community.id}")
    channels = json_response(shown, 200)["channels"]
    assert %{"unread" => 1} = Enum.find(channels, &(&1["id"] == ch.id))
    # Voice channels have no unread count.
    refute Map.has_key?(Enum.find(channels, &(&1["kind"] == "voice")), "unread")

    assert authed(ctx.member)
           |> post(~p"/api/channels/#{ch.id}/read", %{message_id: id})
           |> response(204)

    page = authed(ctx.member) |> get(~p"/api/channels/#{ch.id}/messages") |> json_response(200)
    assert %{"read" => %{"message_id" => ^id}} = page

    shown = authed(ctx.member) |> get(~p"/api/communities/#{ctx.community.id}")

    assert %{"unread" => 0} =
             Enum.find(json_response(shown, 200)["channels"], &(&1["id"] == ch.id))
  end

  test "invalid text answers 422 with field errors", %{text_channel: ch, owner: owner} do
    conn = authed(owner) |> post(~p"/api/channels/#{ch.id}/messages", %{text: "  "})
    assert %{"errors" => %{"text" => [_]}} = json_response(conn, 422)
  end

  test "strangers get 404 and others' messages cannot be deleted", %{text_channel: ch} = ctx do
    stranger = confirmed_user_fixture()
    assert authed(stranger) |> get(~p"/api/channels/#{ch.id}/messages") |> json_response(404)

    sent = authed(ctx.owner) |> post(~p"/api/channels/#{ch.id}/messages", %{text: "mine"})
    %{"message" => %{"id" => id}} = json_response(sent, 201)
    assert authed(ctx.member) |> delete(~p"/api/messages/#{id}") |> json_response(403)
    assert authed(stranger) |> delete(~p"/api/messages/#{id}") |> json_response(404)
  end

  test "message text never appears in logged parameters" do
    assert %{"text" => "[FILTERED]"} = Phoenix.Logger.filter_values(%{"text" => "secret plans"})
  end

  test "socket tickets are only for signed-in users", %{owner: owner} do
    assert build_conn()
           |> put_req_header("content-type", "application/json")
           |> post(~p"/api/socket-token")
           |> json_response(401)

    %{"token" => ticket} = authed(owner) |> post(~p"/api/socket-token") |> json_response(200)
    owner_id = owner.id

    assert {:ok, ^owner_id} =
             Phoenix.Token.verify(NosilenceWeb.Endpoint, "gateway socket", ticket, max_age: 60)
  end

  test "removing a member also removes them from voice; deleting closes rooms", ctx do
    room_with([])

    assert authed(ctx.owner)
           |> delete(~p"/api/communities/#{ctx.community.id}/members/#{ctx.member.id}")
           |> response(204)

    voice = ctx.channel.id
    member_id = ctx.member.id

    assert_receive {:livekit, "RemoveParticipant", %{"room" => ^voice, "identity" => ^member_id},
                    _}

    assert authed(ctx.owner) |> delete(~p"/api/communities/#{ctx.community.id}") |> response(204)
    assert_receive {:livekit, "DeleteRoom", %{"room" => ^voice}, _}
  end

  test "signing out closes the user's live connections", %{owner: owner} do
    NosilenceWeb.Endpoint.subscribe("user_socket:" <> owner.id)
    assert authed(owner) |> delete(~p"/api/session") |> response(204)
    assert_receive %Phoenix.Socket.Broadcast{event: "disconnect"}
  end
end
