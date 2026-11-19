# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.AccessToken do
  @moduledoc """
  Builds LiveKit access tokens.

  A LiveKit access token is a JSON Web Token (JWT) signed with HMAC-SHA256 using
  the API secret shared with the LiveKit server. It tells LiveKit who the
  participant is and what they may do in which room. The server only signs
  tokens here; LiveKit verifies them.

  See https://docs.livekit.io/home/get-started/authentication/
  """

  @header %{"alg" => "HS256", "typ" => "JWT"}

  @typedoc """
  Permissions inside one room (LiveKit `video` grant). Participants get
  `room_join`; the server's own API calls use `room_admin`/`room_create`.
  """
  @type grant :: %{
          required(:room) => String.t(),
          optional(:room_join) => boolean(),
          optional(:room_admin) => boolean(),
          optional(:room_create) => boolean(),
          optional(:can_publish) => boolean(),
          optional(:can_subscribe) => boolean(),
          optional(:can_publish_data) => boolean()
        }

  @doc """
  Returns a signed token.

  Options:
    * `:api_key` and `:api_secret` (required)
    * `:identity` (required): unique participant id
    * `:name`: display name shown to others
    * `:grant` (required): see `t:grant/0`
    * `:ttl_seconds`: lifetime, default 600
    * `:now`: Unix time in seconds, for tests
  """
  @spec sign(keyword()) :: String.t()
  def sign(opts) do
    api_key = Keyword.fetch!(opts, :api_key)
    api_secret = Keyword.fetch!(opts, :api_secret)
    grant = Keyword.fetch!(opts, :grant)
    now = Keyword.get_lazy(opts, :now, fn -> System.system_time(:second) end)
    ttl = Keyword.get(opts, :ttl_seconds, 600)

    claims =
      %{
        "iss" => api_key,
        "sub" => Keyword.fetch!(opts, :identity),
        "nbf" => now,
        "exp" => now + ttl,
        "video" => video_grant(grant)
      }
      |> maybe_put("name", Keyword.get(opts, :name))

    signing_input = encode(@header) <> "." <> encode(claims)
    signing_input <> "." <> base64url(hmac(api_secret, signing_input))
  end

  @doc false
  # Exposed for tests: recompute the signature of a token.
  @spec signature_valid?(String.t(), String.t()) :: boolean()
  def signature_valid?(token, api_secret) do
    case String.split(token, ".") do
      [header, claims, signature] ->
        expected = base64url(hmac(api_secret, header <> "." <> claims))
        Plug.Crypto.secure_compare(expected, signature)

      _ ->
        false
    end
  end

  @grant_keys [
    room_join: "roomJoin",
    room_admin: "roomAdmin",
    room_create: "roomCreate",
    can_publish: "canPublish",
    can_subscribe: "canSubscribe",
    can_publish_data: "canPublishData"
  ]

  # Participant defaults: join, publish and subscribe. Admin grants are opt-in.
  @participant_defaults %{
    room_join: true,
    can_publish: true,
    can_subscribe: true,
    can_publish_data: true
  }

  defp video_grant(grant) do
    defaults = if grant[:room_admin] || grant[:room_create], do: %{}, else: @participant_defaults

    Enum.reduce(@grant_keys, %{"room" => Map.fetch!(grant, :room)}, fn {key, json}, acc ->
      case Map.get(grant, key, Map.get(defaults, key)) do
        nil -> acc
        value -> Map.put(acc, json, value)
      end
    end)
  end

  defp encode(map), do: map |> Jason.encode!() |> base64url()
  defp base64url(bin), do: Base.url_encode64(bin, padding: false)
  defp hmac(secret, data), do: :crypto.mac(:hmac, :sha256, secret, data)

  defp maybe_put(map, _key, nil), do: map
  defp maybe_put(map, key, value), do: Map.put(map, key, value)
end
