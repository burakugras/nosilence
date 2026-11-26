# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.UserChannel do
  @moduledoc """
  The user's own topic (`user:<id>`, only for that user), for desktop
  notifications (ADR 0014).

  It listens to every community the user belongs to and pushes `notify` for a
  message someone else wrote, with the community and channel names the
  notification shows. The client decides whether to show it and whether to
  include the text. Membership changes are followed: a community the user joins
  is added, one they are removed from (or that is deleted) stops at once.
  """
  use Phoenix.Channel

  import Ecto.Query

  alias Nosilence.{Communities, Events, Repo}
  alias Nosilence.Communities.{Channel, Community}
  alias Phoenix.Socket.Broadcast

  intercept ["memberships_changed"]

  @impl true
  def join("user:" <> user_id, _params, socket) do
    if user_id == socket.assigns.user.id do
      {:ok, follow(assign(socket, communities: MapSet.new(), names: %{}))}
    else
      {:error, %{reason: "not_found"}}
    end
  end

  @impl true
  def handle_out("memberships_changed", _payload, socket), do: {:noreply, follow(socket)}

  @impl true
  def handle_info(%Broadcast{event: "message_created", payload: message}, socket) do
    if message.author && message.author.id != socket.assigns.user.id do
      {names, socket} = names(socket, message.channel_id)

      if names do
        push(socket, "notify", %{
          message_id: message.id,
          community_id: names.community_id,
          community_name: names.community_name,
          channel_id: message.channel_id,
          channel_name: names.channel_name,
          author_name: message.author.display_name,
          text: message.text,
          # Named, or everyone/here (ADR 0017); notifications in phase 11b-2 use it.
          mentioned:
            socket.assigns.user.id in (message[:mentions] || []) or
              message[:mention] in ["everyone", "here"]
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
