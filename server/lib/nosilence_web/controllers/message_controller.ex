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
        messages: Enum.map(page.messages, &Messaging.to_payload/1),
        has_more: page.has_more
      })
    end
  end

  def create(conn, %{"channel_id" => channel_id} = params) do
    with {:ok, message} <-
           Messaging.send_message(conn.assigns.current_user, channel_id, params["text"]) do
      conn |> put_status(:created) |> json(%{message: Messaging.to_payload(message)})
    end
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- Messaging.delete_message(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end
end
