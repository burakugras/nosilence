# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.CommunityChannel do
  @moduledoc """
  One topic per community (`community:<id>`), for its members only.

  Delivers presence (online, which voice channel) and `Nosilence.Events`
  (new and deleted messages, member changes). A member who is removed, or
  whose community is deleted, is disconnected from the topic at once.
  Who is speaking is never sent here: it stays inside the LiveKit room.
  """
  use Phoenix.Channel

  alias Nosilence.Communities
  alias NosilenceWeb.Gateway.Presence

  intercept ["member_removed", "community_deleted", "voice_left"]

  @impl true
  def join("community:" <> community_id, _params, socket) do
    case Communities.authorize(socket.assigns.user, community_id, :view) do
      {:ok, membership} ->
        send(self(), :after_join)
        {:ok, assign(socket, :community_id, membership.community_id)}

      _ ->
        {:error, %{reason: "not_found"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    user = socket.assigns.user
    push(socket, "presence_state", Presence.list(socket))

    {:ok, _} =
      Presence.track(socket, user.id, %{display_name: user.display_name, voice_channel_id: nil})

    {:noreply, socket}
  end

  @impl true
  def handle_in("voice_join", %{"channel_id" => channel_id}, socket) do
    case Communities.authorize_channel(socket.assigns.user, channel_id, :join_voice) do
      {:ok, %{kind: "voice", community_id: cid} = channel, _}
      when cid == socket.assigns.community_id ->
        set_voice_channel(socket, channel.id)
        {:reply, :ok, socket}

      _ ->
        {:reply, {:error, %{reason: "not_found"}}, socket}
    end
  end

  def handle_in("voice_leave", _payload, socket) do
    set_voice_channel(socket, nil)
    {:reply, :ok, socket}
  end

  def handle_in(_event, _payload, socket), do: {:reply, {:error, %{reason: "unknown"}}, socket}

  @impl true
  def handle_out("member_removed", %{user_id: user_id} = payload, socket) do
    if user_id == socket.assigns.user.id do
      push(socket, "removed", %{})
      {:stop, :normal, socket}
    else
      push(socket, "member_removed", payload)
      {:noreply, socket}
    end
  end

  # LiveKit says this user left the voice room (ADR 0011): take them out of the
  # channel's voice presence. Server-side only; nothing is pushed.
  def handle_out("voice_left", %{user_id: user_id, channel_id: channel_id}, socket) do
    if user_id == socket.assigns.user.id do
      Presence.update(socket, user_id, fn meta ->
        if meta[:voice_channel_id] == channel_id,
          do: Map.put(meta, :voice_channel_id, nil),
          else: meta
      end)
    end

    {:noreply, socket}
  end

  def handle_out("community_deleted", _payload, socket) do
    push(socket, "removed", %{})
    {:stop, :normal, socket}
  end

  defp set_voice_channel(socket, channel_id) do
    Presence.update(socket, socket.assigns.user.id, fn meta ->
      Map.put(meta, :voice_channel_id, channel_id)
    end)
  end
end
