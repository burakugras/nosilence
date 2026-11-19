# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.UserAuth do
  @moduledoc """
  Session handling for the JSON API.

  Web clients keep the session token in an HttpOnly cookie that JavaScript
  cannot read. The cookie is `SameSite=Lax`, and state-changing requests must
  be JSON (`require_json/2`), which a cross-site form cannot send; together
  this blocks cross-site request forgery without a separate CSRF token.
  """
  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  alias Nosilence.Accounts

  @cookie "_nosilence_session"

  def cookie_name, do: @cookie

  @doc "Assigns `:current_user` (or nil) from the session cookie."
  def fetch_current_user(conn, _opts) do
    conn = fetch_cookies(conn)
    token = conn.cookies[@cookie]
    user = token && Accounts.get_user_by_session(token)

    conn
    |> assign(:current_user, user)
    |> assign(:session_token, user && token)
  end

  def require_authenticated(%{assigns: %{current_user: %{}}} = conn, _opts), do: conn

  def require_authenticated(conn, _opts) do
    conn
    |> put_status(:unauthorized)
    |> json(%{error: "not signed in"})
    |> halt()
  end

  @doc "Rejects state-changing requests that are not JSON (forms, plain text)."
  def require_json(%{method: method} = conn, _opts) when method in ~w(POST PUT PATCH DELETE) do
    case get_req_header(conn, "content-type") do
      ["application/json" <> _] -> conn
      _ -> conn |> put_status(:unsupported_media_type) |> json(%{error: "send JSON"}) |> halt()
    end
  end

  def require_json(conn, _opts), do: conn

  def put_session_cookie(conn, token) do
    put_resp_cookie(conn, @cookie, token,
      http_only: true,
      secure: Application.get_env(:nosilence, :secure_cookies, true),
      same_site: "Lax",
      max_age: Nosilence.Accounts.UserToken.session_validity_days() * 24 * 60 * 60
    )
  end

  def delete_session_cookie(conn) do
    delete_resp_cookie(conn, @cookie,
      http_only: true,
      secure: Application.get_env(:nosilence, :secure_cookies, true),
      same_site: "Lax"
    )
  end
end
