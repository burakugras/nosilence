# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.CommunityController do
  use NosilenceWeb, :controller

  alias Nosilence.Communities
  alias Nosilence.Voice
  alias NosilenceWeb.ChangesetJSON

  action_fallback NosilenceWeb.FallbackController

  def index(conn, _params) do
    communities = Communities.list_communities(conn.assigns.current_user)

    json(conn, %{
      communities:
        Enum.map(communities, &%{id: &1.community.id, name: &1.community.name, role: &1.role})
    })
  end

  def create(conn, params) do
    case Communities.create_community(conn.assigns.current_user, Map.take(params, ["name"])) do
      {:ok, community} ->
        conn
        |> put_status(:created)
        |> json(%{community: %{id: community.id, name: community.name}})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, %{community: c, channels: channels, membership: m}} <-
           Communities.get_community(conn.assigns.current_user, id) do
      unread =
        Nosilence.Messaging.unread_counts(
          conn.assigns.current_user,
          for(ch <- channels, ch.kind == "text", do: ch.id)
        )

      json(conn, %{
        community: %{id: c.id, name: c.name, role: m.role},
        channels:
          Enum.map(channels, fn ch ->
            json = channel_json(ch)
            if ch.kind == "text", do: Map.put(json, :unread, unread[ch.id]), else: json
          end)
      })
    end
  end

  def delete(conn, %{"id" => id}) do
    with {:ok, %{voice_rooms: rooms}} <-
           Communities.delete_community(conn.assigns.current_user, id) do
      Voice.close_rooms(rooms)
      send_resp(conn, :no_content, "")
    end
  end

  def members(conn, %{"id" => id}) do
    with {:ok, members} <- Communities.list_members(conn.assigns.current_user, id) do
      json(conn, %{members: members})
    end
  end

  def remove_member(conn, %{"id" => id, "user_id" => user_id}) do
    with {:ok, %{voice_rooms: rooms}} <-
           Communities.remove_member(conn.assigns.current_user, id, user_id) do
      # Removed members lose voice at once, not only when their token expires.
      Voice.remove_from_rooms(rooms, user_id)
      send_resp(conn, :no_content, "")
    end
  end

  def leave(conn, %{"id" => id}) do
    with :ok <- Communities.leave_community(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def set_role(conn, %{"id" => id, "user_id" => user_id} = params) do
    with :ok <- Communities.set_role(conn.assigns.current_user, id, user_id, params["role"]),
         do: send_resp(conn, :no_content, "")
  end

  @doc "Disconnects someone from the community's voice channels (moderators and owner)."
  def disconnect_voice(conn, %{"id" => id, "user_id" => user_id}) do
    with {:ok, target} <-
           Communities.act_on(conn.assigns.current_user, id, user_id, :disconnect_voice) do
      rooms = Communities.voice_room_ids(target.community_id)
      Voice.remove_from_rooms(rooms, target.user_id)
      for room <- rooms, do: Nosilence.Voice.Watchdog.left(room, target.user_id)
      send_resp(conn, :no_content, "")
    end
  end

  def rename_channel(conn, %{"channel_id" => channel_id} = params) do
    case Communities.rename_channel(conn.assigns.current_user, channel_id, params["name"]) do
      {:ok, ch} ->
        json(conn, %{channel: channel_json(ch)})

      {:error, %Ecto.Changeset{} = cs} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(cs))

      error ->
        error
    end
  end

  def delete_channel(conn, %{"channel_id" => channel_id}) do
    with {:ok, channel} <- Communities.delete_channel(conn.assigns.current_user, channel_id) do
      if channel.kind == "voice", do: Voice.close_rooms([channel.id])
      send_resp(conn, :no_content, "")
    end
  end

  def reorder_channels(conn, %{"id" => id} = params) do
    with :ok <- Communities.reorder_channels(conn.assigns.current_user, id, params["ids"]),
         do: send_resp(conn, :no_content, "")
  end

  def create_channel(conn, %{"id" => id} = params) do
    case Communities.create_channel(conn.assigns.current_user, id, params) do
      {:ok, channel} ->
        conn |> put_status(:created) |> json(%{channel: channel_json(channel)})

      {:error, %Ecto.Changeset{} = cs} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(cs))

      error ->
        error
    end
  end

  defp channel_json(ch), do: %{id: ch.id, name: ch.name, kind: ch.kind, capacity: ch.capacity}
end
