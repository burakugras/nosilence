# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice do
  @moduledoc """
  Voice context: joining the voice room of a channel.

  Media never passes through this server; it flows through LiveKit. Room
  capacity is enforced twice: here, for a clear "room is full" answer, and by
  LiveKit's own `max_participants`, which also covers two people joining at
  the same moment.
  """

  alias Nosilence.Accounts.User
  alias Nosilence.Communities
  alias Nosilence.Voice.{AccessToken, LiveKitAPI}

  @type join :: %{token: String.t(), url: String.t(), room: String.t(), identity: String.t()}

  @doc """
  Token for the voice room of `channel_id`. The user must be a member of the
  channel's community. The LiveKit room is named after the channel id, so
  channels never share a room; identity and name come from the account.
  """
  @spec join_channel(User.t(), term()) ::
          {:ok, join()} | {:error, :not_found | :room_full | :voice_unavailable}
  def join_channel(%User{} = user, channel_id) do
    with {:ok, channel} <- Communities.get_channel_for_voice(user, channel_id),
         room = channel.id,
         :ok <- LiveKitAPI.ensure_room(room, channel.capacity),
         {:ok, identities} <- LiveKitAPI.participant_identities(room),
         :ok <- check_capacity(identities, user.id, channel.capacity) do
      Nosilence.Metrics.count("voice_joins")
      {:ok, issue(user, room)}
    end
  end

  # Rejoining (a second tab, a reconnect) replaces the old connection in LiveKit,
  # so the user's own identity does not count against the limit.
  defp check_capacity(identities, user_id, capacity) do
    others = identities |> Enum.uniq() |> Enum.reject(&(&1 == user_id)) |> length()
    if others < capacity, do: :ok, else: {:error, :room_full}
  end

  defp issue(user, room) do
    config = Application.fetch_env!(:nosilence, __MODULE__)

    token =
      AccessToken.sign(
        api_key: Keyword.fetch!(config, :api_key),
        api_secret: Keyword.fetch!(config, :api_secret),
        identity: user.id,
        name: user.display_name,
        grant: %{room: room},
        ttl_seconds: Keyword.get(config, :token_ttl_seconds, 600)
      )

    %{token: token, url: Keyword.fetch!(config, :livekit_url), room: room, identity: user.id}
  end

  @doc """
  Removes a user from the given voice rooms (after they lose access).
  Best effort: their token would also expire, so a LiveKit outage only logs.
  """
  def remove_from_rooms(rooms, user_id) do
    Enum.each(
      rooms,
      &warn_on_error(LiveKitAPI.remove_participant(&1, user_id), "RemoveParticipant")
    )
  end

  @doc "Closes the given voice rooms, disconnecting everyone (community deleted)."
  def close_rooms(rooms) do
    Enum.each(rooms, &warn_on_error(LiveKitAPI.delete_room(&1), "DeleteRoom"))
  end

  defp warn_on_error(:ok, _what), do: :ok

  defp warn_on_error(_error, what) do
    require Logger
    Logger.warning("LiveKit #{what} failed")
  end
end
