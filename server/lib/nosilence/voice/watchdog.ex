# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.Watchdog do
  @moduledoc """
  Acts on LiveKit's join and leave events (ADR 0011).

  * **Joined:** our clients connect to LiveKit only after they are in the room's
    MLS group. Someone with a LiveKit token but no MLS session (they cannot hear
    anything, but should not sit in the room either) is removed after a grace
    period.
  * **Left:** if the user has no MLS session there either, they are taken out of
    the channel's voice presence, even if their gateway connection is still up
    (for example when only their media connection dropped).
  """
  use GenServer
  require Logger

  alias Nosilence.{Communities, Events}
  alias Nosilence.Voice.{Group, LiveKitAPI}

  def joined(room, identity) when is_binary(room) and is_binary(identity),
    do: GenServer.cast(__MODULE__, {:joined, room, identity})

  def joined(_room, _identity), do: :ok

  def left(room, identity) when is_binary(room) and is_binary(identity) do
    unless Group.has_session?(room, identity) do
      with {:ok, community_id} <- Communities.community_of_channel(room) do
        Events.broadcast(community_id, "voice_left", %{user_id: identity, channel_id: room})
      end
    end

    :ok
  end

  def left(_room, _identity), do: :ok

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil), do: {:ok, nil}

  @impl true
  def handle_cast({:joined, room, identity}, state) do
    Process.send_after(self(), {:check, room, identity}, grace_ms())
    {:noreply, state}
  end

  @impl true
  def handle_info({:check, room, identity}, state) do
    unless Group.has_session?(room, identity) do
      Logger.warning("removing a LiveKit participant that is not in the room's MLS group")
      LiveKitAPI.remove_participant(room, identity)
    end

    {:noreply, state}
  end

  defp grace_ms,
    do: Application.get_env(:nosilence, __MODULE__, [])[:grace_ms] || 10_000
end
