# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.DesktopTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.GoogleStub

  alias Nosilence.Accounts
  alias NosilenceWeb.UserAuth

  @desktop "http://desktop.test"
  @verifier "a-verifier-that-only-the-desktop-app-knows-0123456789"

  defp challenge(verifier),
    do: :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)

  defp json_conn(origin \\ nil) do
    conn = build_conn() |> put_req_header("content-type", "application/json")
    if origin, do: put_req_header(conn, "origin", origin), else: conn
  end

  describe "session token in a header" do
    test "a bearer token authenticates like the cookie" do
      user = confirmed_user_fixture()
      token = Accounts.create_session(user)

      conn =
        json_conn() |> put_req_header("authorization", "Bearer " <> token) |> get(~p"/api/me")

      assert %{"user" => %{"id" => id}} = json_response(conn, 200)
      assert id == user.id

      conn = json_conn() |> put_req_header("authorization", "Bearer nope") |> get(~p"/api/me")
      assert json_response(conn, 401)
    end

    test "signing in from the desktop app returns the token instead of a cookie" do
      user = confirmed_user_fixture()
      body = %{email: user.email, password: valid_password()}

      desktop = json_conn(@desktop) |> post(~p"/api/session", body)
      assert %{"token" => token, "user" => _} = json_response(desktop, 200)
      refute desktop.resp_cookies[UserAuth.cookie_name()]
      assert Accounts.get_user_by_session(token).id == user.id

      # Web pages, or pretending with another Origin, never see the token.
      for origin <- [nil, "http://app.test", "http://evil.test"] do
        web = json_conn(origin) |> post(~p"/api/session", body)
        refute Map.has_key?(json_response(web, 200), "token")
        assert web.resp_cookies[UserAuth.cookie_name()]
      end
    end

    test "signing out with the header ends that session" do
      token = Accounts.create_session(confirmed_user_fixture())

      assert json_conn(@desktop)
             |> put_req_header("authorization", "Bearer " <> token)
             |> delete(~p"/api/session")
             |> response(204)

      refute Accounts.get_user_by_session(token)
    end
  end

  describe "CORS" do
    test "only the desktop origin gets CORS headers, without credentials" do
      preflight =
        build_conn()
        |> put_req_header("origin", @desktop)
        |> put_req_header("access-control-request-method", "POST")
        |> options("/api/session")

      assert preflight.status == 204
      assert get_resp_header(preflight, "access-control-allow-origin") == [@desktop]
      assert get_resp_header(preflight, "access-control-allow-headers") |> hd() =~ "authorization"
      assert get_resp_header(preflight, "access-control-allow-credentials") == []

      other = build_conn() |> put_req_header("origin", "http://evil.test") |> get(~p"/api/me")
      assert get_resp_header(other, "access-control-allow-origin") == []
    end

    test "the gateway accepts the desktop origin" do
      assert NosilenceWeb.Endpoint.allowed_origin?(URI.parse(@desktop))
      refute NosilenceWeb.Endpoint.allowed_origin?(URI.parse("http://desktop.test:8080"))
    end
  end

  describe "Google sign-in from the desktop app" do
    defp begin(params) do
      started = get(build_conn(), ~p"/api/auth/google", params)

      query =
        started |> redirected_to(302) |> URI.parse() |> Map.fetch!(:query) |> URI.decode_query()

      {recycle(started), query}
    end

    defp desktop_params, do: %{desktop_port: "52123", desktop_challenge: challenge(@verifier)}

    defp callback_query(conn) do
      location = redirected_to(conn, 302)
      assert location =~ ~r{\Ahttp://127\.0\.0\.1:52123/callback\?}
      location |> URI.parse() |> Map.fetch!(:query) |> URI.decode_query()
    end

    test "an existing user goes back to the app with a one-time code bound to its verifier" do
      {:ok, user} =
        Accounts.register_google_user(
          %{sub: "google-sub-1", email: "g.user@example.com", name: "G"},
          %{"display_name" => "G", "age_confirmed" => true}
        )

      {conn, query} = begin(desktop_params())
      respond_with(%{"nonce" => query["nonce"]})
      conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})

      %{"code" => code} = callback_query(conn)
      # The browser gets no session: the app does.
      refute conn.resp_cookies[UserAuth.cookie_name()]

      wrong =
        json_conn(@desktop) |> post(~p"/api/auth/desktop/exchange", %{code: code, verifier: "x"})

      assert json_response(wrong, 422)

      # One wrong try uses the code up: an intercepted code cannot be guessed against.
      again =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/exchange", %{code: code, verifier: @verifier})

      assert json_response(again, 422)

      # A fresh sign-in with the right verifier works.
      {conn, query} = begin(desktop_params())
      respond_with(%{"nonce" => query["nonce"]})
      conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})
      %{"code" => code} = callback_query(conn)

      ok =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/exchange", %{code: code, verifier: @verifier})

      assert %{"token" => token, "user" => %{"id" => id}} = json_response(ok, 200)
      assert id == user.id
      assert Accounts.get_user_by_session(token).id == user.id
    end

    test "a first-time Google user signs up inside the app" do
      {conn, query} = begin(desktop_params())

      respond_with(%{
        "nonce" => query["nonce"],
        "email" => "new@example.com",
        "sub" => "new",
        "name" => "Neo"
      })

      conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})
      assert %{"code" => "signup." <> _ = code} = callback_query(conn)
      # The email does not travel readable through the loopback URL.
      refute code =~ "new@example.com"
      refute conn.resp_cookies["_nosilence_google_signup"]

      # The form shows what Google gave us; no account and no token yet.
      shown =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/exchange", %{code: code, verifier: @verifier})

      assert json_response(shown, 200) == %{
               "signup" => %{"email" => "new@example.com", "name" => "Neo"}
             }

      refute Accounts.get_user_by_email("new@example.com")

      # Another app (another verifier) cannot use the code.
      stolen =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/complete-signup", %{
          code: code,
          verifier: String.duplicate("x", 43),
          display_name: "Mallory",
          age_confirmed: true
        })

      assert json_response(stolen, 422)

      # The form is checked like the web one.
      not_adult =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/complete-signup", %{
          code: code,
          verifier: @verifier,
          display_name: "Neo",
          age_confirmed: false
        })

      assert %{"errors" => %{"age_confirmed" => _}} = json_response(not_adult, 422)

      done =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/complete-signup", %{
          code: code,
          verifier: @verifier,
          display_name: "Neo",
          age_confirmed: true
        })

      assert %{"token" => token, "user" => %{"display_name" => "Neo"}} = json_response(done, 200)
      assert Accounts.get_user_by_session(token).email == "new@example.com"

      # Using the code again creates nothing.
      again =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/complete-signup", %{
          code: code,
          verifier: @verifier,
          display_name: "Neo 2",
          age_confirmed: true
        })

      assert json_response(again, 422)
    end

    test "a sign-up code expires after 15 minutes" do
      sealed =
        Phoenix.Token.encrypt(
          NosilenceWeb.Endpoint,
          "desktop google sign-up",
          %{identity: %{sub: "late", email: "late@example.com"}, challenge: challenge(@verifier)},
          signed_at: System.system_time(:second) - 16 * 60
        )

      late =
        json_conn(@desktop)
        |> post(~p"/api/auth/desktop/exchange", %{code: "signup." <> sealed, verifier: @verifier})

      assert json_response(late, 422)
    end

    test "only a loopback port and a proper challenge are accepted" do
      for bad <- [
            %{desktop_port: "80", desktop_challenge: challenge(@verifier)},
            %{desktop_port: "evil.test", desktop_challenge: challenge(@verifier)},
            %{desktop_port: "52123", desktop_challenge: "short"}
          ] do
        assert get(build_conn(), ~p"/api/auth/google", bad).status == 404
      end
    end

    test "errors go back to the app, not to the web page" do
      {conn, query} = begin(desktop_params())

      conn =
        get(conn, ~p"/api/auth/google/callback", %{state: query["state"], error: "access_denied"})

      assert %{"error" => "google_denied"} = callback_query(conn)
    end
  end
end
