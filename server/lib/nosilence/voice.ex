# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice do
  @moduledoc """
  Voice context: everything about joining voice rooms.

  Other parts of the app talk to voice only through the functions in this module.
  Media itself never passes through this server; it flows through LiveKit.
  """

  alias Nosilence.Voice.AccessToken

  alias Nosilence.Accounts.User

  @room_pattern ~r/\A[a-z0-9][a-z0-9-]{0,31}\z/

  @type join :: %{
          token: String.t(),
          url: String.t(),
          room: String.t(),
          identity: String.t()
        }

  @doc """
  Validates the room and returns what a signed-in user needs to join it.

  The LiveKit identity is the user id and the name is the display name, both
  taken from the account (already validated at sign-up), never from the request.
  Room capacity is enforced by LiveKit (`room.max_participants`); from phase 3
  the backend checks it too before issuing a token.
  """
  @spec join_room(term(), User.t()) :: {:ok, join()} | {:error, %{atom() => String.t()}}
  def join_room(room, %User{} = user) do
    with {:ok, room} <- validate_room(room) do
      config = config()

      token =
        AccessToken.sign(
          api_key: Keyword.fetch!(config, :api_key),
          api_secret: Keyword.fetch!(config, :api_secret),
          identity: user.id,
          name: user.display_name,
          grant: %{room: room},
          ttl_seconds: Keyword.get(config, :token_ttl_seconds, 600)
        )

      {:ok,
       %{token: token, url: Keyword.fetch!(config, :livekit_url), room: room, identity: user.id}}
    end
  end

  defp validate_room(room) when is_binary(room) do
    if Regex.match?(@room_pattern, room),
      do: {:ok, room},
      else: {:error, %{room: "use 1-32 lowercase letters, digits or dashes"}}
  end

  defp validate_room(_), do: {:error, %{room: "is required"}}

  defp config, do: Application.fetch_env!(:nosilence, __MODULE__)
end
