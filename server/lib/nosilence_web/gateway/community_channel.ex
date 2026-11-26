# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.CommunityChannel do
  @moduledoc """
  One topic per community (`community:<id>`), for its members only.

  Delivers presence (online, which voice channel, profile picture and status)
  and `Nosilence.Events` (new and deleted messages, member changes). A member
  who is removed, or whose community is deleted, is disconnected from the topic
  at once. Who is speaking is never sent here: it stays inside the LiveKit room.

  Status (ADR 0017): the app reports idle with `activity`; profile changes come
  from `Nosilence.Profiles` on a server-only topic. Someone invisible is not in
  the presence at all, unless they are in a voice channel, where everyone hears
  them anyway: then they show as offline.
  """
  use Phoenix.Channel

  alias Nosilence.Accounts.User
  alias Nosilence.{Communities, Profiles, Repo}
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
    # The socket's copy of the user may be older than their last status change.
    user = Repo.get!(User, socket.assigns.user.id)
    Phoenix.PubSub.subscribe(Nosilence.PubSub, Profiles.topic(user.id))
    push(socket, "presence_state", Presence.list(socket))

    socket =
      assign(socket,
        profile: Profiles.presence_fields(user),
        idle: false,
        voice_channel_id: nil,
        tracked: false
      )

    {:noreply, sync_presence(socket)}
  end

  def handle_info({:profile_changed, fields}, socket),
    do: {:noreply, sync_presence(assign(socket, :profile, fields))}

  @impl true
  def handle_in("voice_join", %{"channel_id" => channel_id}, socket) do
    case Communities.authorize_channel(socket.assigns.user, channel_id, :join_voice) do
      {:ok, %{kind: "voice", community_id: cid} = channel, _}
      when cid == socket.assigns.community_id ->
        {:reply, :ok, set_voice_channel(socket, channel.id)}

      _ ->
        {:reply, {:error, %{reason: "not_found"}}, socket}
    end
  end

  def handle_in("voice_leave", _payload, socket),
    do: {:reply, :ok, set_voice_channel(socket, nil)}

  # No input on this app for a while (or back again).
  def handle_in("activity", %{"idle" => idle}, socket) when is_boolean(idle),
    do: {:reply, :ok, sync_presence(assign(socket, :idle, idle))}

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
    if user_id == socket.assigns.user.id and socket.assigns[:voice_channel_id] == channel_id,
      do: {:noreply, set_voice_channel(socket, nil)},
      else: {:noreply, socket}
  end

  def handle_out("community_deleted", _payload, socket) do
    push(socket, "removed", %{})
    {:stop, :normal, socket}
  end

  defp set_voice_channel(socket, channel_id),
    do: sync_presence(assign(socket, :voice_channel_id, channel_id))

  # Puts this connection's entry in the presence in line with the assigns:
  # tracked, updated or left out (invisible and not in voice).
  defp sync_presence(%{assigns: %{profile: profile} = assigns} = socket) do
    user_id = assigns.user.id
    invisible = profile.status == "invisible"
    visible = not invisible or assigns.voice_channel_id != nil

    meta =
      if invisible,
        do: %{
          display_name: profile.display_name,
          avatar: profile.avatar,
          status: "offline",
          status_text: nil,
          status_expires_at: nil,
          idle: false,
          voice_channel_id: assigns.voice_channel_id
        },
        else:
          Map.merge(profile, %{idle: assigns.idle, voice_channel_id: assigns.voice_channel_id})

    cond do
      visible and assigns.tracked ->
        {:ok, _} = Presence.update(socket, user_id, meta)
        socket

      visible ->
        {:ok, _} = Presence.track(socket, user_id, meta)
        assign(socket, :tracked, true)

      assigns.tracked ->
        :ok = Presence.untrack(socket, user_id)
        assign(socket, :tracked, false)

      true ->
        socket
    end
  end

  # Before :after_join ran (a very early voice_join): nothing to sync yet.
  defp sync_presence(socket), do: socket
end
