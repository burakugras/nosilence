# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.LiveKitAPI do
  @moduledoc """
  The few LiveKit server API calls we need (Twirp over HTTP, JSON).

  Each call is authorised with a short-lived admin token for exactly one room.
  See https://docs.livekit.io/reference/server/server-apis/
  """

  alias Nosilence.Voice.AccessToken

  @doc """
  Creates the room, or keeps the existing one, with a hard participant limit.
  LiveKit itself refuses anyone above `max_participants`.
  """
  def ensure_room(room, max_participants) do
    call(room, "CreateRoom", %{name: room, max_participants: max_participants, empty_timeout: 300})
    |> case do
      {:ok, _} -> :ok
      error -> error
    end
  end

  @doc "Identities currently in the room."
  def participant_identities(room) do
    case call(room, "ListParticipants", %{room: room}) do
      {:ok, body} -> {:ok, body |> Map.get("participants", []) |> Enum.map(& &1["identity"])}
      error -> error
    end
  end

  defp call(room, method, body) do
    config = Application.fetch_env!(:nosilence, Nosilence.Voice)

    token =
      AccessToken.sign(
        api_key: Keyword.fetch!(config, :api_key),
        api_secret: Keyword.fetch!(config, :api_secret),
        identity: "nosilence-server",
        grant: %{room: room, room_admin: true, room_create: true},
        ttl_seconds: 60
      )

    request =
      Req.new(
        [
          url: Keyword.fetch!(config, :api_url) <> "/twirp/livekit.RoomService/" <> method,
          json: body,
          auth: {:bearer, token},
          retry: false,
          receive_timeout: 3_000
        ] ++ Keyword.get(config, :req_options, [])
      )

    case Req.post(request) do
      {:ok, %{status: 200, body: body}} when is_map(body) -> {:ok, body}
      {:ok, _response} -> {:error, :voice_unavailable}
      {:error, _exception} -> {:error, :voice_unavailable}
    end
  end
end
