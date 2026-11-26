# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.FallbackController do
  @moduledoc "Turns `{:error, reason}` from contexts into JSON responses."
  use NosilenceWeb, :controller

  def call(conn, {:error, %Ecto.Changeset{} = changeset}) do
    conn
    |> put_status(:unprocessable_entity)
    |> json(NosilenceWeb.ChangesetJSON.errors(changeset))
  end

  def call(conn, {:error, :sending_too_fast, retry_after_ms}),
    do: NosilenceWeb.RateLimited.too_many(conn, retry_after_ms, :message)

  def call(conn, {:error, :not_found}), do: error(conn, :not_found, "not found")
  def call(conn, {:error, :forbidden}), do: error(conn, :forbidden, "not allowed")

  def call(conn, {:error, :invalid_invite}),
    do: error(conn, :unprocessable_entity, "invite is invalid or has expired")

  def call(conn, {:error, {:invalid, field}}),
    do: error(conn, :unprocessable_entity, "invalid #{field}")

  def call(conn, {:error, :edit_limit}),
    do:
      error(
        conn,
        :unprocessable_entity,
        "a message can be edited at most #{Nosilence.Messaging.max_edits()} times"
      )

  def call(conn, {:error, {:handover_cooldown, until}}),
    do:
      conn
      |> put_status(:unprocessable_entity)
      |> json(%{
        error: "you can hand this community over again after #{DateTime.to_iso8601(until)}",
        handover_available_at: until
      })

  # The same answer for unknown, blocked and not-allowed users (ADR 0015).
  def call(conn, {:error, :cannot_request}),
    do: error(conn, :unprocessable_entity, "could not send a friend request to this user")

  def call(conn, {:error, :already_friends}),
    do: error(conn, :conflict, "you are already friends")

  def call(conn, {:error, :too_many_requests}),
    do: error(conn, :too_many_requests, "too many friend requests, try again later")

  def call(conn, {:error, :cannot_message}),
    do: error(conn, :forbidden, "you cannot message this person")

  def call(conn, {:error, :room_full}), do: error(conn, :conflict, "this voice channel is full")

  def call(conn, {:error, :voice_unavailable}),
    do: error(conn, :service_unavailable, "voice is unavailable right now")

  defp error(conn, status, message), do: conn |> put_status(status) |> json(%{error: message})
end
