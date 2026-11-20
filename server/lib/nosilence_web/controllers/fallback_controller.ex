# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.FallbackController do
  @moduledoc "Turns `{:error, reason}` from contexts into JSON responses."
  use NosilenceWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(NosilenceWeb.ChangesetJSON.errors(changeset))
  end

  def call(conn, {:error, :rate_limited, retry_after_ms}),
    do: NosilenceWeb.RateLimited.too_many(conn, retry_after_ms)

  def call(conn, {:error, :not_found}), do: error(conn, :not_found, "not found")
  def call(conn, {:error, :forbidden}), do: error(conn, :forbidden, "not allowed")

  def call(conn, {:error, :invalid_invite}),
    do: error(conn, :unprocessable_entity, "invite is invalid or has expired")

  def call(conn, {:error, {:invalid, field}}),
    do: error(conn, :unprocessable_entity, "invalid #{field}")

  def call(conn, {:error, :room_full}), do: error(conn, :conflict, "this voice channel is full")

  def call(conn, {:error, :voice_unavailable}),
    do: error(conn, :service_unavailable, "voice is unavailable right now")

  defp error(conn, status, message), do: conn |> put_status(status) |> json(%{error: message})
end
