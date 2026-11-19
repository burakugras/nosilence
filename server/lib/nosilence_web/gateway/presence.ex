# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.Presence do
  @moduledoc """
  Who is online in a community and which voice channel they are in. Entries
  disappear by themselves when a connection closes.
  """
  use Phoenix.Presence, otp_app: :nosilence, pubsub_server: Nosilence.PubSub
end
