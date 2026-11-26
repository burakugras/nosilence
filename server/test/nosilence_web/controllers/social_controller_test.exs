# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.SocialControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures

  alias Nosilence.Accounts

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(NosilenceWeb.UserAuth.cookie_name(), Accounts.create_session(user))
  end

  setup do
    %{
      ayse: confirmed_user_fixture(%{"display_name" => "Ayşe"}),
      cem: confirmed_user_fixture(%{"display_name" => "Cem"})
    }
  end

  test "choose a username; /api/me shows it with the privacy choices", %{ayse: ayse, cem: cem} do
    assert %{"user" => %{"username" => "ayse"}} =
             authed(ayse) |> put(~p"/api/me/username", %{username: "Ayse"}) |> json_response(200)

    assert %{"errors" => %{"username" => ["is taken"]}} =
             authed(cem) |> put(~p"/api/me/username", %{username: "AYSE"}) |> json_response(422)

    assert %{
             "user" => %{
               "username" => "ayse",
               "friend_requests_from" => "everyone",
               "community_members_can_message" => true
             }
           } = authed(ayse) |> get(~p"/api/me") |> json_response(200)

    assert %{"user" => %{"friend_requests_from" => "communities"}} =
             authed(ayse)
             |> patch(~p"/api/me/privacy", %{friend_requests_from: "communities"})
             |> json_response(200)
  end

  test "friends, then a direct conversation with messages", %{ayse: ayse, cem: cem} do
    authed(cem) |> put(~p"/api/me/username", %{username: "cem"})

    assert %{"result" => "requested"} =
             authed(ayse) |> post(~p"/api/friends", %{username: "cem"}) |> json_response(200)

    assert %{"incoming" => [%{"username" => nil, "display_name" => "Ayşe"}]} =
             authed(cem) |> get(~p"/api/friends") |> json_response(200)

    assert authed(cem) |> post(~p"/api/friends/#{ayse.id}/accept") |> response(204)

    %{"conversation" => %{"id" => id}} =
      authed(ayse) |> post(~p"/api/conversations", %{user_id: cem.id}) |> json_response(200)

    assert %{"message" => %{"text" => "merhaba", "id" => message_id}} =
             authed(ayse)
             |> post(~p"/api/conversations/#{id}/messages", %{text: "merhaba"})
             |> json_response(201)

    assert %{"conversations" => [%{"id" => ^id, "unread" => 1, "kind" => "direct"}]} =
             authed(cem) |> get(~p"/api/conversations") |> json_response(200)

    assert authed(cem)
           |> post(~p"/api/conversations/#{id}/read", %{message_id: message_id})
           |> response(204)

    assert %{"messages" => [%{"text" => "merhaba"}], "read" => %{"message_id" => ^message_id}} =
             authed(cem) |> get(~p"/api/conversations/#{id}/messages") |> json_response(200)

    # Blocked: the history stays, writing is refused.
    assert authed(cem) |> post(~p"/api/blocks/#{ayse.id}") |> response(204)

    assert %{"error" => "you cannot message this person"} =
             authed(ayse)
             |> post(~p"/api/conversations/#{id}/messages", %{text: "hey"})
             |> json_response(403)

    # And a blocked person gets the same answer as for an unknown username.
    assert %{"error" => "could not send a friend request to this user"} =
             authed(ayse) |> post(~p"/api/friends", %{username: "cem"}) |> json_response(422)

    assert %{"error" => "could not send a friend request to this user"} =
             authed(ayse) |> post(~p"/api/friends", %{username: "nobody"}) |> json_response(422)
  end

  test "strangers cannot open a conversation or read one", %{ayse: ayse, cem: cem} do
    assert authed(ayse) |> post(~p"/api/conversations", %{user_id: cem.id}) |> json_response(403)

    assert authed(cem)
           |> get(~p"/api/conversations/#{Ecto.UUID.generate()}/messages")
           |> json_response(404)
  end
end
