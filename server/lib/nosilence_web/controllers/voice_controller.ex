# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.VoiceController do
  use NosilenceWeb, :controller

  alias Nosilence.Voice

  @doc "Token for a voice room. Signed-in users only; rooms open to all until phase 3."
  def token(conn, params) do
    case Voice.join_room(params["room"], conn.assigns.current_user) do
      {:ok, join} ->
        json(conn, join)

      {:error, errors} ->
        conn |> put_status(:unprocessable_entity) |> json(%{errors: errors})
    end
  end
end
