# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.CommunityControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.LiveKitStub

  alias Nosilence.Accounts

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(NosilenceWeb.UserAuth.cookie_name(), Accounts.create_session(user))
  end

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    created = authed(owner) |> post(~p"/api/communities", %{name: "Ekip"})
    %{"community" => %{"id" => id}} = json_response(created, 201)

    %{"channels" => [%{"id" => channel_id}]} =
      json_response(authed(owner) |> get(~p"/api/communities/#{id}"), 200)

    %{owner: owner, id: id, channel_id: channel_id}
  end

  test "invite flow: owner creates a link, a new user previews and joins it", %{
    owner: owner,
    id: id
  } do
    created = authed(owner) |> post(~p"/api/communities/#{id}/invites", %{max_uses: 5})

    assert %{"url" => "http://app.test/invite?token=" <> token, "invite" => %{"max_uses" => 5}} =
             json_response(created, 201)

    friend = confirmed_user_fixture()
    preview = authed(friend) |> post(~p"/api/invites/preview", %{token: token})
    assert %{"community" => %{"name" => "Ekip"}} = json_response(preview, 200)

    # Before joining, the friend cannot see the community.
    assert json_response(authed(friend) |> get(~p"/api/communities/#{id}"), 404)

    accepted = authed(friend) |> post(~p"/api/invites/accept", %{token: token})
    assert %{"community" => %{"id" => ^id}} = json_response(accepted, 200)

    assert %{"communities" => [%{"id" => ^id, "role" => "member"}]} =
             json_response(authed(friend) |> get(~p"/api/communities"), 200)

    assert %{"members" => [%{"role" => "owner"}, %{"role" => "member"}]} =
             json_response(authed(friend) |> get(~p"/api/communities/#{id}/members"), 200)
  end

  test "members cannot do owner things", %{owner: owner, id: id} do
    member = confirmed_user_fixture()
    {:ok, token, _} = Nosilence.Communities.create_invite(owner, id)
    {:ok, _} = Nosilence.Communities.accept_invite(member, token)

    assert json_response(authed(member) |> post(~p"/api/communities/#{id}/invites", %{}), 403)

    assert json_response(
             authed(member) |> post(~p"/api/communities/#{id}/channels", %{name: "x"}),
             403
           )

    assert json_response(authed(member) |> delete(~p"/api/communities/#{id}"), 403)
  end

  test "voice token answers 404 for strangers and 409 when the channel is full",
       %{owner: owner, id: id, channel_id: channel_id} do
    stranger = confirmed_user_fixture()
    room_with([])

    assert json_response(
             authed(stranger) |> post(~p"/api/channels/#{channel_id}/voice-token", %{}),
             404
           )

    member = confirmed_user_fixture()
    {:ok, token, _} = Nosilence.Communities.create_invite(owner, id)
    {:ok, _} = Nosilence.Communities.accept_invite(member, token)

    room_with(for i <- 1..8, do: "u#{i}")
    full = authed(member) |> post(~p"/api/channels/#{channel_id}/voice-token", %{})
    assert json_response(full, 409)["error"] =~ "full"
  end

  test "invite tokens never appear in logged parameters" do
    assert Phoenix.Logger.filter_values(%{"token" => "secret-value"}) == %{
             "token" => "[FILTERED]"
           }
  end

  test "an invalid invite answers 422", %{owner: owner} do
    assert json_response(authed(owner) |> post(~p"/api/invites/accept", %{token: "nope"}), 422)
  end

  test "invite options are validated", %{owner: owner, id: id} do
    resp = authed(owner) |> post(~p"/api/communities/#{id}/invites", %{expires_in_hours: 10_000})
    assert json_response(resp, 422)["error"] =~ "expires_in_hours"
  end
end
