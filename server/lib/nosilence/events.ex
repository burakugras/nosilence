# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Events do
  @moduledoc """
  Real-time events for the members of one community. The gateway
  (`NosilenceWeb.Gateway`) delivers them to connected clients.
  """

  def community_topic(community_id), do: "community:" <> community_id

  def broadcast(community_id, event, payload) do
    Phoenix.Channel.Server.broadcast(
      Nosilence.PubSub,
      community_topic(community_id),
      event,
      payload
    )
  end
end
