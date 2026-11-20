# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.PrivacyControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures

  alias Nosilence.Accounts
  alias NosilenceWeb.UserAuth

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(UserAuth.cookie_name(), Accounts.create_session(user))
  end

  test "export downloads a JSON file" do
    user = confirmed_user_fixture()
    conn = authed(user) |> get(~p"/api/account/export")

    assert %{"account" => %{"email" => email}} = json_response(conn, 200)
    assert email == user.email
    assert [disposition] = get_resp_header(conn, "content-disposition")
    assert disposition =~ ~r/attachment; filename="nosilence-data-\d{4}-\d{2}-\d{2}\.json"/
  end

  test "delete answers field errors, then deletes and signs out" do
    user = confirmed_user_fixture()

    conn = authed(user) |> delete(~p"/api/account", %{confirm_email: user.email, password: "no"})
    assert %{"errors" => %{"password" => [_]}} = json_response(conn, 422)

    conn =
      authed(user)
      |> delete(~p"/api/account", %{confirm_email: user.email, password: valid_password()})

    assert response(conn, 204)
    assert conn.resp_cookies[UserAuth.cookie_name()].max_age == 0
    refute Accounts.get_user(user.id)
  end

  test "both need a signed-in user" do
    conn = build_conn() |> put_req_header("content-type", "application/json")
    assert conn |> get(~p"/api/account/export") |> json_response(401)
    assert conn |> delete(~p"/api/account", %{}) |> json_response(401)
  end
end
