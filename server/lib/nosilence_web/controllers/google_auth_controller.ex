# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.GoogleAuthController do
  @moduledoc """
  Browser side of "Sign in with Google".

  `start` and `callback` are full-page navigations (not JSON calls). Between them the
  browser keeps state, nonce and PKCE verifier in a signed, HttpOnly, 10-minute cookie.
  A first-time Google user lands on /complete-signup, where they pick a display name
  and confirm being 18+; until then the verified identity waits in a second signed cookie.

  The desktop app opens `start` in the system browser with `desktop_port` (its loopback
  listener) and `desktop_challenge` (PKCE, RFC 8252). The callback then sends the
  browser to `http://127.0.0.1:<port>/callback` with a one-time code instead of setting
  a cookie; the app redeems it with its verifier at `POST /api/auth/desktop/exchange`.

  A first-time Google user of the desktop app gets a sign-up code instead: the verified
  identity and the PKCE challenge, encrypted and valid for 15 minutes. The app shows the
  sign-up form itself and sends the code, its verifier and the form to
  `POST /api/auth/desktop/complete-signup` (ADR 0014).
  """
  use NosilenceWeb, :controller

  alias Nosilence.Accounts
  alias Nosilence.Accounts.Google
  alias NosilenceWeb.{ChangesetJSON, UserAuth}

  @flow_cookie "_nosilence_oauth"
  @signup_cookie "_nosilence_google_signup"
  @flow_max_age 10 * 60
  @signup_max_age 15 * 60
  @desktop_signup_salt "desktop google sign-up"
  @desktop_signup_prefix "signup."

  def providers(conn, _params), do: json(conn, %{google: Google.enabled?()})

  def start(conn, params) do
    with true <- Google.enabled?(),
         {:ok, desktop} <- desktop_params(params) do
      {url, kept} = Google.authorize()
      kept = if desktop, do: Map.put(kept, :desktop, desktop), else: kept

      conn
      |> put_resp_cookie(@flow_cookie, kept, cookie_opts(@flow_max_age))
      |> redirect(external: url)
    else
      _ -> send_resp(conn, :not_found, "")
    end
  end

  # Only a loopback port and a well-formed S256 challenge: never an arbitrary redirect.
  defp desktop_params(%{"desktop_port" => port, "desktop_challenge" => challenge}) do
    with {port, ""} when port in 1024..65_535 <- Integer.parse(port),
         true <- Regex.match?(~r/\A[A-Za-z0-9_-]{43}\z/, challenge) do
      {:ok, %{port: port, challenge: challenge}}
    else
      _ -> :error
    end
  end

  defp desktop_params(_params), do: {:ok, nil}

  def callback(conn, params) do
    conn = fetch_cookies(conn, signed: [@flow_cookie])
    kept = conn.cookies[@flow_cookie]
    conn = delete_resp_cookie(conn, @flow_cookie, cookie_opts(0))

    with %{state: _} <- kept || {:error, :flow_expired},
         {:ok, identity} <- Google.verify_callback(params, kept),
         result <- Accounts.sign_in_with_google(identity) do
      case {result, kept[:desktop]} do
        {{:ok, user}, %{} = desktop} ->
          # The traffic record is written when the app redeems the code (its own address).
          code = Accounts.create_desktop_handoff(user, desktop.challenge)
          to_desktop(conn, desktop, code: code)

        {{:new, identity}, %{} = desktop} ->
          # The app shows the sign-up form itself (ADR 0014).
          to_desktop(conn, desktop, code: desktop_signup_code(identity, desktop.challenge))

        {{:error, _}, %{} = desktop} ->
          to_desktop(conn, desktop, error: "google")

        {result, nil} ->
          web_result(conn, result)
      end
    else
      {:error, reason} ->
        case kept do
          %{desktop: desktop} -> to_desktop(conn, desktop, error: error_code(reason))
          _ -> to_app(conn, "/login?error=#{error_code(reason)}")
        end
    end
  end

  defp web_result(conn, result) do
    case result do
      {:ok, user} ->
        conn
        |> UserAuth.log_sign_in(user)
        |> UserAuth.put_session_cookie(Accounts.create_session(user))
        |> to_app("/")

      {:new, identity} ->
        conn
        |> put_resp_cookie(@signup_cookie, identity, cookie_opts(@signup_max_age))
        |> to_app("/complete-signup")

      {:error, _changeset} ->
        to_app(conn, "/login?error=google")
    end
  end

  defp to_desktop(conn, %{port: port}, query),
    do: redirect(conn, external: "http://127.0.0.1:#{port}/callback?" <> URI.encode_query(query))

  @doc """
  Desktop app: trades the one-time code (and its PKCE verifier) for a session token,
  or, for a first-time Google user, returns what the sign-up form shows.
  """
  def exchange(conn, %{"code" => @desktop_signup_prefix <> sealed, "verifier" => verifier}) do
    case open_desktop_signup(sealed, verifier) do
      {:ok, identity} -> json(conn, %{signup: %{email: identity.email, name: identity[:name]}})
      :error -> expired(conn)
    end
  end

  def exchange(conn, %{"code" => code, "verifier" => verifier}) do
    case Accounts.redeem_desktop_handoff(code, verifier) do
      {:ok, user, token} ->
        conn
        |> UserAuth.log_sign_in(user)
        |> json(%{
          user: %{id: user.id, email: user.email, display_name: user.display_name},
          token: token
        })

      :error ->
        conn |> put_status(:unprocessable_entity) |> json(%{error: "sign-in expired, try again"})
    end
  end

  def exchange(conn, _params), do: expired(conn)

  @doc "Desktop app: creates the account of a first-time Google user and signs them in."
  def complete_desktop(
        conn,
        %{"code" => @desktop_signup_prefix <> sealed, "verifier" => verifier} = params
      ) do
    with {:ok, identity} <- open_desktop_signup(sealed, verifier),
         {:ok, user} <- Accounts.register_google_user(identity, params) do
      conn
      |> UserAuth.log_sign_in(user)
      |> json(%{
        user: %{id: user.id, email: user.email, display_name: user.display_name},
        token: Accounts.create_session(user)
      })
    else
      :error ->
        expired(conn)

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
    end
  end

  def complete_desktop(conn, _params), do: expired(conn)

  # The identity is encrypted (the email does not travel readable through the
  # loopback URL) and bound to the app's PKCE challenge, so only the app that
  # started the sign-in can use it. Using it twice only fails: the Google
  # account is then already registered.
  defp desktop_signup_code(identity, challenge) do
    @desktop_signup_prefix <>
      Phoenix.Token.encrypt(NosilenceWeb.Endpoint, @desktop_signup_salt, %{
        identity: identity,
        challenge: challenge
      })
  end

  defp open_desktop_signup(sealed, verifier) do
    with {:ok, %{identity: identity, challenge: challenge}} <-
           Phoenix.Token.decrypt(NosilenceWeb.Endpoint, @desktop_signup_salt, sealed,
             max_age: @signup_max_age
           ),
         true <- Accounts.pkce_matches?(challenge, verifier) do
      {:ok, identity}
    else
      _ -> :error
    end
  end

  defp expired(conn),
    do: conn |> put_status(:unprocessable_entity) |> json(%{error: "sign-in expired, try again"})

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
            |> UserAuth.log_sign_in(user)
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
