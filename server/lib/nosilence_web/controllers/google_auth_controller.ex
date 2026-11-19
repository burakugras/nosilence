# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.GoogleAuthController do
  @moduledoc """
  Browser side of "Sign in with Google".

  `start` and `callback` are full-page navigations (not JSON calls). Between them the
  browser keeps state, nonce and PKCE verifier in a signed, HttpOnly, 10-minute cookie.
  A first-time Google user lands on /complete-signup, where they pick a display name
  and confirm being 18+; until then the verified identity waits in a second signed cookie.
  """
  use NosilenceWeb, :controller

  alias Nosilence.Accounts
  alias Nosilence.Accounts.Google
  alias NosilenceWeb.{ChangesetJSON, UserAuth}

  @flow_cookie "_nosilence_oauth"
  @signup_cookie "_nosilence_google_signup"
  @flow_max_age 10 * 60
  @signup_max_age 15 * 60

  def providers(conn, _params), do: json(conn, %{google: Google.enabled?()})

  def start(conn, _params) do
    if Google.enabled?() do
      {url, kept} = Google.authorize()

      conn
      |> put_resp_cookie(@flow_cookie, kept, cookie_opts(@flow_max_age))
      |> redirect(external: url)
    else
      send_resp(conn, :not_found, "")
    end
  end

  def callback(conn, params) do
    conn = fetch_cookies(conn, signed: [@flow_cookie])
    kept = conn.cookies[@flow_cookie]
    conn = delete_resp_cookie(conn, @flow_cookie, cookie_opts(0))

    with %{state: _} <- kept || {:error, :flow_expired},
         {:ok, identity} <- Google.verify_callback(params, kept),
         result <- Accounts.sign_in_with_google(identity) do
      case result do
        {:ok, user} ->
          conn |> UserAuth.put_session_cookie(Accounts.create_session(user)) |> to_app("/")

        {:new, identity} ->
          conn
          |> put_resp_cookie(@signup_cookie, identity, cookie_opts(@signup_max_age))
          |> to_app("/complete-signup")

        {:error, _changeset} ->
          to_app(conn, "/login?error=google")
      end
    else
      {:error, reason} -> to_app(conn, "/login?error=#{error_code(reason)}")
    end
  end

  @doc "What the complete-signup page shows: the email and name Google gave us."
  def pending(conn, _params) do
    case pending_identity(conn) do
      {conn, %{email: email, name: name}} -> json(conn, %{email: email, name: name})
      {conn, nil} -> conn |> put_status(:not_found) |> json(%{error: "no pending Google sign-up"})
    end
  end

  def complete(conn, params) do
    case pending_identity(conn) do
      {conn, nil} ->
        conn |> put_status(:not_found) |> json(%{error: "no pending Google sign-up"})

      {conn, identity} ->
        case Accounts.register_google_user(identity, params) do
          {:ok, user} ->
            conn
            |> delete_resp_cookie(@signup_cookie, cookie_opts(0))
            |> UserAuth.put_session_cookie(Accounts.create_session(user))
            |> json(%{user: %{id: user.id, email: user.email, display_name: user.display_name}})

          {:error, changeset} ->
            conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
        end
    end
  end

  defp pending_identity(conn) do
    conn = fetch_cookies(conn, signed: [@signup_cookie])

    case conn.cookies[@signup_cookie] do
      %{sub: _, email: _} = identity -> {conn, identity}
      _ -> {conn, nil}
    end
  end

  defp to_app(conn, path),
    do: redirect(conn, external: Application.fetch_env!(:nosilence, :app_url) <> path)

  defp error_code(:email_not_verified), do: "google_email"
  defp error_code(:denied), do: "google_denied"
  defp error_code(_), do: "google"

  defp cookie_opts(max_age) do
    [
      sign: true,
      http_only: true,
      same_site: "Lax",
      secure: Application.get_env(:nosilence, :secure_cookies, true),
      max_age: max_age
    ]
  end
end
