# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.SessionController do
  use NosilenceWeb, :controller

  alias Nosilence.Accounts
  alias NosilenceWeb.{RateLimited, UserAuth}

  def create(conn, %{"email" => email, "password" => password}) when is_binary(email) do
    with :ok <-
           RateLimited.check(conn,
             sign_in_ip: RateLimited.ip(conn),
             sign_in_email: email |> String.trim() |> String.downcase()
           ) do
      authenticate(conn, email, password)
    else
      {:halted, conn} -> conn
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unauthorized) |> json(%{error: "wrong email or password"})
  end

  defp authenticate(conn, email, password) do
    case Accounts.authenticate(email, password) do
      {:ok, user} ->
        token = Accounts.create_session(user)
        conn = UserAuth.log_sign_in(conn, user)

        # The desktop app stores the token itself; web pages only ever get the cookie.
        if UserAuth.desktop_origin?(conn) do
          json(conn, %{user: user_json(user), token: token})
        else
          conn |> UserAuth.put_session_cookie(token) |> json(%{user: user_json(user)})
        end

      {:error, :unconfirmed} ->
        conn |> put_status(:forbidden) |> json(%{error: "confirm your email first"})

      {:error, :invalid_credentials} ->
        # One message for unknown email and wrong password: no account enumeration.
        conn |> put_status(:unauthorized) |> json(%{error: "wrong email or password"})
    end
  end

  def delete(conn, _params) do
    if token = conn.assigns.session_token, do: Accounts.delete_session(token)
    # Close live connections too; the user's other devices reconnect with their own session.
    if user = conn.assigns.current_user, do: NosilenceWeb.Gateway.Socket.disconnect_user(user.id)
    conn |> UserAuth.delete_session_cookie() |> send_resp(:no_content, "")
  end

  def show(conn, _params) do
    json(conn, %{user: user_json(conn.assigns.current_user)})
  end

  defp user_json(user), do: NosilenceWeb.UserJSON.user(user)
end
