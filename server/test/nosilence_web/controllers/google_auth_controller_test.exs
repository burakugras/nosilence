# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.GoogleAuthControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.GoogleStub

  alias NosilenceWeb.UserAuth

  @session UserAuth.cookie_name()

  # Follows /api/auth/google and returns the conn ready for the callback,
  # carrying the signed flow cookie, plus the state/nonce from Google's URL.
  defp begin(conn) do
    started = get(conn, ~p"/api/auth/google")

    query =
      started |> redirected_to(302) |> URI.parse() |> Map.fetch!(:query) |> URI.decode_query()

    {recycle(started), query}
  end

  test "providers tells the client whether Google is enabled", %{conn: conn} do
    assert json_response(get(conn, ~p"/api/auth/providers"), 200) == %{"google" => true}
  end

  test "start redirects to Google and keeps the flow in a signed HttpOnly cookie", %{conn: conn} do
    conn = get(conn, ~p"/api/auth/google")

    assert redirected_to(conn, 302) =~ "https://accounts.google.com/o/oauth2/v2/auth?"
    cookie = conn.resp_cookies["_nosilence_oauth"]
    assert cookie.http_only
    assert cookie.same_site == "Lax"
    refute cookie.value =~ "verifier"
  end

  test "an existing Google user is signed in and sent to the app", %{conn: conn} do
    {:ok, user} =
      Nosilence.Accounts.register_google_user(
        %{sub: "google-sub-1", email: "g.user@example.com", name: "G"},
        %{"display_name" => "G", "age_confirmed" => true}
      )

    {conn, query} = begin(conn)
    respond_with(%{"nonce" => query["nonce"]})
    conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})

    assert redirected_to(conn, 302) == "http://app.test/"
    token = conn.resp_cookies[@session].value
    assert Nosilence.Accounts.get_user_by_session(token).id == user.id
  end

  test "a first-time Google user completes sign-up with a name and the 18+ confirmation",
       %{conn: conn} do
    {conn, query} = begin(conn)
    respond_with(%{"nonce" => query["nonce"], "email" => "new.g@example.com", "sub" => "new-sub"})
    conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})

    assert redirected_to(conn, 302) == "http://app.test/complete-signup"
    refute conn.resp_cookies[@session]

    pending = conn |> recycle() |> get(~p"/api/auth/google/signup")
    assert %{"email" => "new.g@example.com", "name" => "G User"} = json_response(pending, 200)

    refused =
      pending
      |> recycle()
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/auth/google/signup", %{display_name: "Yeni"})

    assert %{"errors" => %{"age_confirmed" => _}} = json_response(refused, 422)

    done =
      pending
      |> recycle()
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/auth/google/signup", %{display_name: "Yeni", age_confirmed: true})

    assert %{"user" => %{"email" => "new.g@example.com", "display_name" => "Yeni"}} =
             json_response(done, 200)

    assert done.resp_cookies[@session].value
  end

  test "a callback without the flow cookie is refused", %{conn: conn} do
    respond_with(%{"nonce" => "x"})
    conn = get(conn, ~p"/api/auth/google/callback", %{state: "s", code: "c"})
    assert redirected_to(conn, 302) == "http://app.test/login?error=google"
    refute conn.resp_cookies[@session]
  end

  test "a forged state is refused", %{conn: conn} do
    {conn, query} = begin(conn)
    respond_with(%{"nonce" => query["nonce"]})
    conn = get(conn, ~p"/api/auth/google/callback", %{state: "forged", code: "c"})
    assert redirected_to(conn, 302) == "http://app.test/login?error=google"
  end

  test "the flow cookie works only once", %{conn: conn} do
    {conn, query} = begin(conn)
    respond_with(%{"nonce" => query["nonce"]})
    first = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})
    assert first.resp_cookies["_nosilence_oauth"].max_age == 0
  end

  test "complete-signup without a pending Google identity is refused", %{conn: conn} do
    conn =
      conn
      |> put_req_header("content-type", "application/json")
      |> post(~p"/api/auth/google/signup", %{display_name: "x", age_confirmed: true})

    assert json_response(conn, 404)
  end

  test "an unverified Google email gets its own error code", %{conn: conn} do
    _ = confirmed_user_fixture()
    {conn, query} = begin(conn)
    respond_with(%{"nonce" => query["nonce"], "email_verified" => false})
    conn = get(conn, ~p"/api/auth/google/callback", %{state: query["state"], code: "c"})
    assert redirected_to(conn, 302) == "http://app.test/login?error=google_email"
  end
end
