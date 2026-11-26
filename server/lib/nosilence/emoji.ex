# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Emoji do
  @moduledoc """
  The emoji a reaction may use (ADR 0017): exactly the ones in the app's picker,
  generated from Unicode's list by `tools/emoji/generate.mjs` into
  `priv/emoji.txt`. Anything else (text, several emoji, control characters) is
  refused.
  """

  @source Path.join([__DIR__, "..", "..", "priv", "emoji.txt"])
  @external_resource @source

  @allowed @source
           |> File.read!()
           |> String.split("\n", trim: true)
           |> Enum.reject(&String.starts_with?(&1, "#"))
           |> MapSet.new()

  @doc "True if `emoji` is one of the allowed reaction emoji."
  def allowed?(emoji) when is_binary(emoji), do: MapSet.member?(@allowed, emoji)
  def allowed?(_), do: false
end
