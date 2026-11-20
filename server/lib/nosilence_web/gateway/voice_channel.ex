# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.VoiceChannel do
  @moduledoc """
  `voice:<channel_id>`: carries one device's MLS messages for a voice channel to
  and from `Nosilence.Voice.Group`. Members of the channel's community only.
  The bytes are opaque here: the server orders them but cannot read them.

  A member who is removed, or whose community is deleted, is disconnected at
  once, which makes the group remove them and change the key.
  """
  use Phoenix.Channel

  alias Nosilence.{Communities, Events}
  alias Nosilence.Voice.Group

  # Limits for opaque MLS messages (bytes, before base64). A group of 8 needs far less.
  @max_key_package 4_096
  @max_message 65_536

  @impl true
  def join("voice:" <> channel_id, %{"key_package" => key_package}, socket) do
    user = socket.assigns.user

    with {:ok, %{kind: "voice"} = channel, _} <-
           Communities.authorize_channel(user, channel_id, :join_voice),
         {:ok, key_package} <- decode(key_package, @max_key_package) do
      Phoenix.PubSub.subscribe(Nosilence.PubSub, Events.community_topic(channel.community_id))
      {action, group_id} = Group.join(channel.id, user.id, self(), key_package)
      socket = assign(socket, :voice_channel_id, channel.id)
      {:ok, %{action: Atom.to_string(action), group_id: Base.encode64(group_id)}, socket}
    else
      _ -> {:error, %{reason: "not_found"}}
    end
  end

  def join(_topic, _params, _socket), do: {:error, %{reason: "not_found"}}

  @impl true
  def handle_in("commit", %{"epoch" => epoch} = payload, socket) when is_integer(epoch) do
    with {:ok, commit} <- decode(payload["commit"], @max_message),
         {:ok, welcome} <- decode_optional(payload["welcome"]),
         :ok <-
           Group.commit(
             socket.assigns.voice_channel_id,
             socket.assigns.user.id,
             self(),
             epoch,
             commit,
             welcome
           ) do
      {:reply, :ok, socket}
    else
      _ -> {:reply, {:error, %{reason: "stale"}}, socket}
    end
  end

  def handle_in(_event, _payload, socket), do: {:reply, {:error, %{reason: "unknown"}}, socket}

  @impl true
  def handle_info({:voice_group, event, payload}, socket) when event in ~w(superseded reset) do
    push(socket, event, payload)
    {:stop, :normal, socket}
  end

  def handle_info({:voice_group, event, payload}, socket) do
    push(socket, event, payload)
    {:noreply, socket}
  end

  # Community events: losing access ends the voice session at once.
  def handle_info(
        %Phoenix.Socket.Broadcast{event: "member_removed", payload: %{user_id: id}},
        socket
      ) do
    if id == socket.assigns.user.id, do: stop(socket), else: {:noreply, socket}
  end

  def handle_info(%Phoenix.Socket.Broadcast{event: "community_deleted"}, socket), do: stop(socket)
  def handle_info(%Phoenix.Socket.Broadcast{}, socket), do: {:noreply, socket}

  defp stop(socket) do
    push(socket, "removed", %{})
    {:stop, :normal, socket}
  end

  defp decode(value, max) when is_binary(value) do
    case Base.decode64(value) do
      {:ok, bytes} when byte_size(bytes) > 0 and byte_size(bytes) <= max -> {:ok, bytes}
      _ -> :error
    end
  end

  defp decode(_value, _max), do: :error

  defp decode_optional(nil), do: {:ok, nil}
  defp decode_optional(value), do: decode(value, @max_message)
end
