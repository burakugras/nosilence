# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.DevVoiceController do
  @moduledoc """
  Development-only endpoint for the Phase 1 walking skeleton: anyone can get a
  token for any room. It is compiled in only when `:dev_voice_tokens` is enabled
  and is replaced by an authenticated endpoint in Phase 2-3.
  """
  use NosilenceWeb, :controller

  alias Nosilence.Voice

  def create(conn, params) do
    case Voice.join_room(params["room"], params["name"]) do
      {:ok, join} ->
        json(conn, join)

      {:error, errors} ->
        conn
        |> put_status(:unprocessable_entity)
        |> json(%{errors: errors})
    end
  end
end
