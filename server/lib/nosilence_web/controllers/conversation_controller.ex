# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.ConversationController do
  @moduledoc "Direct and group conversations and their messages (ADR 0015)."
  use NosilenceWeb, :controller

  alias Nosilence.Social

  action_fallback NosilenceWeb.FallbackController

  def index(conn, _params),
    do: json(conn, %{conversations: Social.list_conversations(conn.assigns.current_user)})

  @doc "`user_id`: the direct conversation with them. `member_ids` (+ `name`): a new group."
  def create(conn, %{"user_id" => user_id}) do
    with {:ok, c} <- Social.open_direct(conn.assigns.current_user, user_id),
         do: json(conn, %{conversation: %{id: c.id}})
  end

  def create(conn, %{"member_ids" => ids} = params) do
    with {:ok, c} <- Social.create_group(conn.assigns.current_user, ids, params["name"]),
         do: conn |> put_status(:created) |> json(%{conversation: %{id: c.id}})
  end

  def create(_conn, _params), do: {:error, {:invalid, "members"}}

  def rename(conn, %{"id" => id} = params) do
    with :ok <- Social.rename_group(conn.assigns.current_user, id, params["name"]),
         do: send_resp(conn, :no_content, "")
  end

  def add_members(conn, %{"id" => id} = params) do
    with :ok <- Social.add_members(conn.assigns.current_user, id, params["user_ids"]),
         do: send_resp(conn, :no_content, "")
  end

  def remove_member(conn, %{"id" => id, "user_id" => user_id}) do
    with :ok <- Social.remove_member(conn.assigns.current_user, id, user_id),
         do: send_resp(conn, :no_content, "")
  end

  def messages(conn, %{"id" => id} = params) do
    with {:ok, page} <-
           Social.list_messages(conn.assigns.current_user, id, Map.take(params, ["before"])) do
      json(conn, %{
        messages:
          Enum.map(page.messages, &Social.to_payload(&1, Map.get(page.reactions, &1.id, []))),
        has_more: page.has_more,
        read: page.read
      })
    end
  end

  def send_message(conn, %{"id" => id} = params) do
    with {:ok, message} <-
           Social.send_message(conn.assigns.current_user, id, params["text"], mentions(params)),
         do: conn |> put_status(:created) |> json(%{message: Social.to_payload(message, [])})
  end

  def read(conn, %{"id" => id, "message_id" => message_id}) do
    with :ok <- Social.mark_read(conn.assigns.current_user, id, message_id),
         do: send_resp(conn, :no_content, "")
  end

  def update_message(conn, %{"message_id" => id} = params) do
    with {:ok, message} <-
           Social.edit_message(conn.assigns.current_user, id, params["text"], mentions(params)),
         do: json(conn, %{message: Social.to_payload(message)})
  end

  def delete_message(conn, %{"message_id" => id}) do
    with :ok <- Social.delete_message(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def add_reaction(conn, %{"message_id" => id, "emoji" => emoji}) do
    with :ok <- Social.react(conn.assigns.current_user, id, emoji, true),
         do: send_resp(conn, :no_content, "")
  end

  def remove_reaction(conn, %{"message_id" => id, "emoji" => emoji}) do
    with :ok <- Social.react(conn.assigns.current_user, id, emoji, false),
         do: send_resp(conn, :no_content, "")
  end

  defp mentions(params), do: Map.take(params, ["mentions"])
end
