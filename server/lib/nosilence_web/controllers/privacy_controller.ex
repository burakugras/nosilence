# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.PrivacyController do
  use NosilenceWeb, :controller

  alias Nosilence.Privacy
  alias NosilenceWeb.UserAuth

  def deletion_preview(conn, _params) do
    json(conn, Privacy.deletion_preview(conn.assigns.current_user))
  end

  def delete(conn, params) do
    case Privacy.delete_account(conn.assigns.current_user, params) do
      :ok ->
        conn |> UserAuth.delete_session_cookie() |> send_resp(:no_content, "")

      {:error, :confirm_email} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: %{confirm_email: ["does not match your email"]}})

      {:error, :hand_over} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: %{hand_over: ["choose up to three members of each community"]}})

      {:error, :password} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: %{password: ["is not correct"]}})
    end
  end

  def export(conn, _params) do
    filename = "nosilence-data-#{Date.utc_today()}.json"

    conn
    |> put_resp_header("content-disposition", ~s(attachment; filename="#{filename}"))
    |> json(Privacy.export(conn.assigns.current_user))
  end
end
