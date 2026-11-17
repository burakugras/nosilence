# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice do
  @moduledoc """
  Voice context: everything about joining voice rooms.

  Other parts of the app talk to voice only through the functions in this module.
  Media itself never passes through this server; it flows through LiveKit.
  """

  alias Nosilence.Voice.AccessToken

  @room_pattern ~r/\A[a-z0-9][a-z0-9-]{0,31}\z/
  @max_name_length 32

  @type join :: %{
          token: String.t(),
          url: String.t(),
          room: String.t(),
          identity: String.t()
        }

  @doc """
  Validates the request and returns what a client needs to join a room.

  Phase 1 has no accounts yet: every join gets a fresh random identity.
  Room capacity is enforced by LiveKit (`room.max_participants`); from Phase 3
  the backend checks it too before issuing a token.
  """
  @spec join_room(term(), term()) :: {:ok, join()} | {:error, %{atom() => String.t()}}
  def join_room(room, display_name) do
    with {:ok, room} <- validate_room(room),
         {:ok, name} <- validate_name(display_name) do
      config = config()
      identity = Ecto.UUID.generate()

      token =
        AccessToken.sign(
          api_key: Keyword.fetch!(config, :api_key),
          api_secret: Keyword.fetch!(config, :api_secret),
          identity: identity,
          name: name,
          grant: %{room: room},
          ttl_seconds: Keyword.get(config, :token_ttl_seconds, 600)
        )

      {:ok,
       %{token: token, url: Keyword.fetch!(config, :livekit_url), room: room, identity: identity}}
    end
  end

  defp validate_room(room) when is_binary(room) do
    if Regex.match?(@room_pattern, room),
      do: {:ok, room},
      else: {:error, %{room: "use 1-32 lowercase letters, digits or dashes"}}
  end

  defp validate_room(_), do: {:error, %{room: "is required"}}

  defp validate_name(name) when is_binary(name) do
    name = String.trim(name)

    cond do
      name == "" -> {:error, %{name: "is required"}}
      String.length(name) > @max_name_length -> {:error, %{name: "is too long"}}
      String.match?(name, ~r/[\p{Cc}\p{Cf}]/u) -> {:error, %{name: "has invalid characters"}}
      true -> {:ok, name}
    end
  end

  defp validate_name(_), do: {:error, %{name: "is required"}}

  defp config, do: Application.fetch_env!(:nosilence, __MODULE__)
end
