# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.UserChannel do
  @moduledoc """
  The user's own topic (`user:<id>`, only for that user).

  - Notifications (ADR 0014): it listens to every community the user belongs
    to and pushes `notify` for a message someone else wrote, with the names the
    notification shows. Communities or channels the user set to "nothing" (ADR
    0018) only send messages that mention them, for the mention count. The client
    decides whether to show a notification. Membership changes are followed.
  - Friends' status (ADR 0018): each connection is tracked on
    `friend_presence:<user id>`, a topic only the user's friends' connections
    follow, so the status reaches nobody else. Invisible people are not
    tracked. `friends_presence` sends everything on join, `friend_presence` one
    friend's change.
  """
  use Phoenix.Channel

  import Ecto.Query

  alias Nosilence.Accounts.User
  alias Nosilence.{Communities, Events, NotificationSettings, Profiles, Repo, Social}
  alias Nosilence.Communities.{Channel, Community}
  alias NosilenceWeb.Gateway.Presence
  alias Phoenix.Socket.Broadcast

  intercept ["memberships_changed", "friends_changed", "notification_settings_changed"]

  # How long a channel's notification level is kept before asking again.
  @level_ttl_ms 60_000

  @impl true
  def join("user:" <> user_id, _params, socket) do
    if user_id == socket.assigns.user.id do
      send(self(), :after_join)

      {:ok,
       socket
       |> assign(communities: MapSet.new(), names: %{}, levels: %{}, friends: MapSet.new())
       |> assign(:blocked, MapSet.new(Social.blocked_ids(socket.assigns.user.id)))
       |> assign(profile: nil, idle: false, tracked: false)
       |> follow()}
    else
      {:error, %{reason: "not_found"}}
    end
  end

  @impl true
  def handle_out("memberships_changed", _payload, socket), do: {:noreply, follow(socket)}

  # Friends or blocks changed: follow the friends, and know whom the user blocked.
  def handle_out("friends_changed", payload, socket) do
    push(socket, "friends_changed", payload)
    socket = assign(socket, :blocked, MapSet.new(Social.blocked_ids(socket.assigns.user.id)))
    {:noreply, follow_friends(socket)}
  end

  def handle_out("notification_settings_changed", payload, socket) do
    push(socket, "notification_settings_changed", payload)
    {:noreply, assign(socket, :levels, %{})}
  end

  # No input on this app for a while (or back again), as on community topics.
  @impl true
  def handle_in("activity", %{"idle" => idle}, socket) when is_boolean(idle),
    do: {:reply, :ok, sync_presence(assign(socket, :idle, idle))}

  def handle_in(_event, _payload, socket), do: {:reply, {:error, %{reason: "unknown"}}, socket}

  @impl true
  def handle_info(:after_join, socket) do
    user = Repo.get!(User, socket.assigns.user.id)
    Phoenix.PubSub.subscribe(Nosilence.PubSub, Profiles.topic(user.id))
    socket = assign(socket, :profile, Profiles.presence_fields(user))
    {:noreply, socket |> sync_presence() |> follow_friends()}
  end

  def handle_info({:profile_changed, fields}, socket),
    do: {:noreply, sync_presence(assign(socket, :profile, fields))}

  # A friend's connections changed: tell the app their status now.
  def handle_info(
        %Broadcast{topic: "friend_presence:" <> friend_id, event: "presence_diff"},
        socket
      ) do
    if MapSet.member?(socket.assigns.friends, friend_id),
      do: push(socket, "friend_presence", %{user_id: friend_id, metas: metas(friend_id)})

    {:noreply, socket}
  end

  def handle_info(%Broadcast{event: "message_created", payload: message}, socket) do
    me = socket.assigns.user.id

    # Nothing from people the user blocked (ADR 0019).
    if message.author && message.author.id != me &&
         not MapSet.member?(socket.assigns.blocked, message.author.id) do
      {names, socket} = names(socket, message.channel_id)
      mentioned = me in (message[:mentions] || []) or message[:mention] in ["everyone", "here"]
      {level, socket} = level(socket, names, message.channel_id)

      if names && (level != "none" or mentioned) do
        push(socket, "notify", %{
          message_id: message.id,
          community_id: names.community_id,
          community_name: names.community_name,
          channel_id: message.channel_id,
          channel_name: names.channel_name,
          author_name: message.author.display_name,
          text: message.text,
          # Named, or everyone/here (ADR 0017); the app's mention count and
          # notifications use it (ADR 0018).
          mentioned: mentioned
        })
      end

      {:noreply, socket}
    else
      {:noreply, socket}
    end
  end

  def handle_info(%Broadcast{event: "member_removed", payload: %{user_id: id}}, socket)
      when id == socket.assigns.user.id,
      do: {:noreply, follow(socket)}

  def handle_info(%Broadcast{event: "community_deleted"}, socket), do: {:noreply, follow(socket)}

  # Renamed or deleted channels: look the names up again.
  def handle_info(%Broadcast{event: event}, socket)
      when event in ["channels_changed", "channel_created"],
      do: {:noreply, assign(socket, :names, %{})}

  def handle_info(%Broadcast{}, socket), do: {:noreply, socket}

  # Listen to exactly the communities the user belongs to now.
  defp follow(socket) do
    now =
      socket.assigns.user
      |> Communities.list_communities()
      |> MapSet.new(& &1.community.id)

    before = socket.assigns.communities

    for id <- MapSet.difference(before, now),
        do: Phoenix.PubSub.unsubscribe(Nosilence.PubSub, Events.community_topic(id))

    for id <- MapSet.difference(now, before),
        do: Phoenix.PubSub.subscribe(Nosilence.PubSub, Events.community_topic(id))

    assign(socket, communities: now, names: %{})
  end

  # Follow exactly the user's friends' presence; on join (or when friends
  # change) send every friend's status, so friends that went away are cleared too.
  defp follow_friends(socket) do
    now = socket.assigns.user.id |> Social.friend_ids() |> MapSet.new()
    before = socket.assigns.friends

    for id <- MapSet.difference(before, now),
        do: Phoenix.PubSub.unsubscribe(Nosilence.PubSub, friend_topic(id))

    for id <- MapSet.difference(now, before),
        do: Phoenix.PubSub.subscribe(Nosilence.PubSub, friend_topic(id))

    presence =
      now
      |> Enum.map(&{&1, metas(&1)})
      |> Enum.reject(fn {_, metas} -> metas == [] end)
      |> Map.new()

    push(socket, "friends_presence", %{presence: presence})
    assign(socket, :friends, now)
  end

  defp friend_topic(user_id), do: "friend_presence:" <> user_id

  defp metas(user_id) do
    case Presence.get_by_key(friend_topic(user_id), user_id) do
      %{metas: metas} -> Enum.map(metas, &Map.delete(&1, :phx_ref))
      _ -> []
    end
  end

  # This connection's entry on the user's own friend topic: tracked, updated,
  # or left out while invisible.
  defp sync_presence(%{assigns: %{profile: nil}} = socket), do: socket

  defp sync_presence(%{assigns: %{profile: profile} = assigns} = socket) do
    user_id = assigns.user.id
    topic = friend_topic(user_id)
    meta = Map.merge(Map.delete(profile, :display_name), %{idle: assigns.idle})

    cond do
      profile.status == "invisible" and assigns.tracked ->
        :ok = Presence.untrack(self(), topic, user_id)
        assign(socket, :tracked, false)

      profile.status == "invisible" ->
        socket

      assigns.tracked ->
        {:ok, _} = Presence.update(self(), topic, user_id, meta)
        socket

      true ->
        {:ok, _} = Presence.track(self(), topic, user_id, meta)
        assign(socket, :tracked, true)
    end
  end

  # The notification level of a channel for this user, kept for a minute.
  defp level(socket, nil, _channel_id), do: {"all", socket}

  defp level(socket, names, channel_id) do
    now = System.monotonic_time(:millisecond)

    case socket.assigns.levels do
      %{^channel_id => {level, at}} when now - at < @level_ttl_ms ->
        {level, socket}

      levels ->
        level = NotificationSettings.level(socket.assigns.user.id, names.community_id, channel_id)
        {level, assign(socket, :levels, Map.put(levels, channel_id, {level, now}))}
    end
  end

  defp names(socket, channel_id) do
    case socket.assigns.names do
      %{^channel_id => names} ->
        {names, socket}

      cache ->
        names =
          Repo.one(
            from ch in Channel,
              join: c in Community,
              on: c.id == ch.community_id,
              where: ch.id == ^channel_id,
              select: %{
                community_id: c.id,
                community_name: c.name,
                channel_name: ch.name
              }
          )

        {names, assign(socket, :names, Map.put(cache, channel_id, names))}
    end
  end
end
