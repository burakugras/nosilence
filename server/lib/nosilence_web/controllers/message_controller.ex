# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.MessageController do
  use NosilenceWeb, :controller

  alias Nosilence.Messaging

  action_fallback NosilenceWeb.FallbackController

  def index(conn, %{"channel_id" => channel_id} = params) do
    with {:ok, page} <-
           Messaging.list_messages(
             conn.assigns.current_user,
             channel_id,
             Map.take(params, ["before"])
           ) do
      json(conn, %{
        messages:
          Enum.map(page.messages, &Messaging.to_payload(&1, Map.get(page.reactions, &1.id, []))),
        has_more: page.has_more,
        read: page.read
      })
    end
  end

  def create(conn, %{"channel_id" => channel_id} = params) do
    with {:ok, message} <-
           Messaging.send_message(
             conn.assigns.current_user,
             channel_id,
             params["text"],
             mentions(params)
           ) do
      conn |> put_status(:created) |> json(%{message: Messaging.to_payload(message, [])})
    end
  end

  def update(conn, %{"id" => id} = params) do
    with {:ok, message} <-
           Messaging.edit_message(conn.assigns.current_user, id, params["text"], mentions(params)),
         do: json(conn, %{message: Messaging.to_payload(message)})
  end

  def read(conn, %{"channel_id" => channel_id, "message_id" => message_id}) do
    with :ok <- Messaging.mark_read(conn.assigns.current_user, channel_id, message_id),
         do: send_resp(conn, :no_content, "")
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- Messaging.delete_message(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def add_reaction(conn, %{"id" => id, "emoji" => emoji}) do
    with :ok <- Messaging.react(conn.assigns.current_user, id, emoji, true),
         do: send_resp(conn, :no_content, "")
  end

  def remove_reaction(conn, %{"id" => id, "emoji" => emoji}) do
    with :ok <- Messaging.react(conn.assigns.current_user, id, emoji, false),
         do: send_resp(conn, :no_content, "")
  end

  defp mentions(params), do: Map.take(params, ["mentions", "mention"])
end
