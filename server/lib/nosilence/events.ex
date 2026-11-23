# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Events do
  @moduledoc """
  Real-time events for the members of one community. The gateway
  (`NosilenceWeb.Gateway`) delivers them to connected clients.
  """

  def community_topic(community_id), do: "community:" <> community_id

  def user_topic(user_id), do: "user:" <> user_id

  @doc "The user joined a community: their own topic starts following it."
  def memberships_changed(user_id),
    do:
      Phoenix.Channel.Server.broadcast(
        Nosilence.PubSub,
        user_topic(user_id),
        "memberships_changed",
        %{}
      )

  def broadcast(community_id, event, payload) do
    Phoenix.Channel.Server.broadcast(
      Nosilence.PubSub,
      community_topic(community_id),
      event,
      payload
    )
  end
end
