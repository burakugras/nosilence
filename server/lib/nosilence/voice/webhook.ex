# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.Webhook do
  @moduledoc """
  LiveKit webhooks (ADR 0011): LiveKit tells us who joins and leaves rooms.

  Each request carries a JWT signed with our API secret, whose `sha256` claim is
  the hash of the exact body; anything else is refused. Room names are channel
  ids and identities are account ids (see `Nosilence.Voice`).
  """

  alias Nosilence.Voice.{AccessToken, Watchdog}

  @doc "Checks the signature against the raw body. `{:ok, event}` or `:error`."
  def verify(authorization, raw_body) when is_binary(authorization) and is_binary(raw_body) do
    config = Application.fetch_env!(:nosilence, Nosilence.Voice)

    with true <- AccessToken.signature_valid?(authorization, config[:api_secret]),
         {:ok, claims} <- claims(authorization),
         true <- claims["iss"] == config[:api_key],
         true <- is_integer(claims["exp"]) and claims["exp"] > System.system_time(:second),
         true <- Plug.Crypto.secure_compare(claims["sha256"] || "", body_hash(raw_body)),
         {:ok, event} <- Jason.decode(raw_body) do
      {:ok, event}
    else
      _ -> :error
    end
  end

  def verify(_authorization, _raw_body), do: :error

  @doc "Acts on a verified event."
  def handle(%{"event" => "participant_joined", "room" => %{"name" => room}} = e),
    do: Watchdog.joined(room, e["participant"]["identity"])

  def handle(%{"event" => "participant_left", "room" => %{"name" => room}} = e),
    do: Watchdog.left(room, e["participant"]["identity"])

  def handle(_event), do: :ok

  defp claims(token) do
    with [_, payload, _] <- String.split(token, "."),
         {:ok, json} <- Base.url_decode64(payload, padding: false) do
      Jason.decode(json)
    else
      _ -> :error
    end
  end

  # LiveKit uses standard (padded) base64 for this claim.
  defp body_hash(raw), do: :crypto.hash(:sha256, raw) |> Base.encode64()
end
