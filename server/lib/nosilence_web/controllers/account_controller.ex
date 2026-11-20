# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.AccountController do
  use NosilenceWeb, :controller

  alias Nosilence.Accounts
  alias NosilenceWeb.{ChangesetJSON, RateLimited}

  # Every action here may send an email: limit them per IP address.
  plug :limit_by_ip when action in [:register, :resend_confirmation, :request_password_reset]

  defp limit_by_ip(conn, _opts) do
    case RateLimited.check(conn, email_ip: RateLimited.ip(conn)) do
      :ok -> conn
      {:halted, conn} -> halt(conn)
    end
  end

  def register(conn, params) do
    attrs = Map.take(params, ["email", "display_name", "password", "age_confirmed"])

    case Accounts.register_user(attrs) do
      {:ok, _user} ->
        conn |> put_status(:created) |> json(%{status: "confirmation email sent"})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
    end
  end

  def confirm(conn, %{"token" => token}) when is_binary(token) do
    case Accounts.confirm_user(token) do
      {:ok, _user} -> json(conn, %{status: "confirmed"})
      {:error, :invalid_token} -> invalid_link(conn)
    end
  end

  def confirm(conn, _params), do: invalid_link(conn)

  # Same answer whether or not the email exists.
  def resend_confirmation(conn, %{"email" => email}) when is_binary(email) do
    :ok = Accounts.resend_confirmation(email)

    conn
    |> put_status(:accepted)
    |> json(%{status: "if the account exists, an email is on its way"})
  end

  def request_password_reset(conn, %{"email" => email}) when is_binary(email) do
    :ok = Accounts.request_password_reset(email)

    conn
    |> put_status(:accepted)
    |> json(%{status: "if the account exists, an email is on its way"})
  end

  def reset_password(conn, %{"token" => token, "password" => password})
      when is_binary(token) and is_binary(password) do
    case Accounts.reset_password(token, %{"password" => password}) do
      {:ok, user} ->
        # Every session was signed out; close their live connections as well.
        NosilenceWeb.Gateway.Socket.disconnect_user(user.id)
        json(conn, %{status: "password changed"})

      {:error, :invalid_token} ->
        invalid_link(conn)

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
    end
  end

  def reset_password(conn, _params), do: invalid_link(conn)

  defp invalid_link(conn) do
    conn |> put_status(:unprocessable_entity) |> json(%{error: "link is invalid or has expired"})
  end
end
