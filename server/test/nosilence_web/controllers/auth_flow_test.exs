# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.AuthFlowTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures

  alias NosilenceWeb.UserAuth

  @cookie UserAuth.cookie_name()

  defp json_conn(conn), do: put_req_header(conn, "content-type", "application/json")

  defp sign_in(conn, user) do
    conn
    |> json_conn()
    |> post(~p"/api/session", %{email: user.email, password: valid_password()})
  end

  defp with_session(conn, signed_in) do
    token = signed_in.resp_cookies[@cookie].value
    conn |> recycle() |> json_conn() |> put_req_cookie(@cookie, token)
  end

  test "full flow: register, confirm, sign in, me, voice token, sign out", %{conn: conn} do
    attrs = valid_attrs(%{"email" => "flow@example.com"})
    conn = conn |> json_conn() |> post(~p"/api/accounts", attrs)
    assert json_response(conn, 201)

    # Unconfirmed: cannot sign in yet.
    blocked =
      build_conn()
      |> json_conn()
      |> post(~p"/api/session", %{email: "flow@example.com", password: valid_password()})

    assert json_response(blocked, 403)["error"] =~ "confirm"

    token = token_from_email("flow@example.com")
    confirmed = build_conn() |> json_conn() |> post(~p"/api/accounts/confirm", %{token: token})
    assert json_response(confirmed, 200)

    signed_in =
      build_conn()
      |> json_conn()
      |> post(~p"/api/session", %{email: "flow@example.com", password: valid_password()})

    assert %{"user" => %{"email" => "flow@example.com", "display_name" => "Burak"}} =
             json_response(signed_in, 200)

    me = build_conn() |> with_session(signed_in) |> get(~p"/api/me")
    assert %{"user" => %{"id" => id}} = json_response(me, 200)

    voice =
      build_conn() |> with_session(signed_in) |> post(~p"/api/voice/token", %{room: "lobby"})

    assert %{"identity" => ^id, "room" => "lobby", "token" => _} = json_response(voice, 200)

    out = build_conn() |> with_session(signed_in) |> delete(~p"/api/session")
    assert response(out, 204)

    # The old cookie no longer works.
    after_out = build_conn() |> with_session(signed_in) |> get(~p"/api/me")
    assert json_response(after_out, 401)
  end

  test "session cookie is HttpOnly and SameSite=Lax", %{conn: conn} do
    signed_in = sign_in(conn, confirmed_user_fixture())
    cookie = signed_in.resp_cookies[@cookie]

    assert cookie.http_only
    assert cookie.same_site == "Lax"
    assert cookie.max_age == 60 * 24 * 60 * 60
  end

  test "wrong password and unknown email get the same 401", %{conn: conn} do
    user = confirmed_user_fixture()

    wrong =
      conn
      |> json_conn()
      |> post(~p"/api/session", %{email: user.email, password: "not the password"})

    unknown =
      build_conn()
      |> json_conn()
      |> post(~p"/api/session", %{email: "x@example.com", password: "whatever12345"})

    assert json_response(wrong, 401) == json_response(unknown, 401)
    refute wrong.resp_cookies[@cookie]
  end

  test "registration errors come back per field", %{conn: conn} do
    conn =
      conn
      |> json_conn()
      |> post(~p"/api/accounts", %{email: "bad", password: "short", display_name: ""})

    errors = json_response(conn, 422)["errors"]

    assert Map.keys(errors) |> Enum.sort() == ~w(age_confirmed display_name email password)
  end

  test "registration ignores fields it does not expect", %{conn: conn} do
    attrs =
      valid_attrs(%{"email" => "extra@example.com", "confirmed_at" => "2020-01-01T00:00:00Z"})

    conn = conn |> json_conn() |> post(~p"/api/accounts", attrs)
    assert json_response(conn, 201)
    refute Nosilence.Accounts.get_user_by_email("extra@example.com").confirmed_at
  end

  test "password reset request answers the same for known and unknown emails", %{conn: conn} do
    user = confirmed_user_fixture()
    known = conn |> json_conn() |> post(~p"/api/accounts/password-reset", %{email: user.email})

    unknown =
      build_conn()
      |> json_conn()
      |> post(~p"/api/accounts/password-reset", %{email: "x@example.com"})

    assert json_response(known, 202) == json_response(unknown, 202)
  end

  test "password reset through the API signs the user out", %{conn: conn} do
    user = confirmed_user_fixture()
    signed_in = sign_in(conn, user)

    build_conn() |> json_conn() |> post(~p"/api/accounts/password-reset", %{email: user.email})
    token = token_from_email(user.email)

    reset =
      build_conn()
      |> json_conn()
      |> post(~p"/api/accounts/password-reset/confirm", %{
        token: token,
        password: "a brand new passphrase"
      })

    assert json_response(reset, 200)
    assert json_response(build_conn() |> with_session(signed_in) |> get(~p"/api/me"), 401)
  end

  test "bad links get a 422", %{conn: conn} do
    assert json_response(
             conn |> json_conn() |> post(~p"/api/accounts/confirm", %{token: "nope"}),
             422
           )

    assert json_response(build_conn() |> json_conn() |> post(~p"/api/accounts/confirm", %{}), 422)
  end

  describe "protection" do
    test "voice tokens need a session", %{conn: conn} do
      conn = conn |> json_conn() |> post(~p"/api/voice/token", %{room: "lobby"})
      assert json_response(conn, 401)
    end

    test "the old unauthenticated dev endpoint is gone", %{conn: conn} do
      conn = conn |> json_conn() |> post("/api/dev/voice-token", %{room: "lobby", name: "x"})
      assert conn.status == 404
    end

    test "non-JSON requests that change state are refused (cross-site forms)", %{conn: conn} do
      user = confirmed_user_fixture()

      conn =
        conn
        |> put_req_header("content-type", "application/x-www-form-urlencoded")
        |> post(~p"/api/session", "email=#{user.email}&password=#{valid_password()}")

      assert json_response(conn, 415)
      refute conn.resp_cookies[@cookie]
    end

    test "a forged cookie is ignored", %{conn: conn} do
      conn = conn |> put_req_cookie(@cookie, "forged") |> get(~p"/api/me")
      assert json_response(conn, 401)
    end
  end
end
