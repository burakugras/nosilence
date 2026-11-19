# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.SessionController do
  use NosilenceWeb, :controller

  alias Nosilence.Accounts
  alias NosilenceWeb.UserAuth

  def create(conn, %{"email" => email, "password" => password}) do
    case Accounts.authenticate(email, password) do
      {:ok, user} ->
        token = Accounts.create_session(user)
        conn |> UserAuth.put_session_cookie(token) |> json(%{user: user_json(user)})

      {:error, :unconfirmed} ->
        conn |> put_status(:forbidden) |> json(%{error: "confirm your email first"})

      {:error, :invalid_credentials} ->
        # One message for unknown email and wrong password: no account enumeration.
        conn |> put_status(:unauthorized) |> json(%{error: "wrong email or password"})
    end
  end

  def create(conn, _params) do
    conn |> put_status(:unauthorized) |> json(%{error: "wrong email or password"})
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

  defp user_json(user), do: %{id: user.id, email: user.email, display_name: user.display_name}
end
