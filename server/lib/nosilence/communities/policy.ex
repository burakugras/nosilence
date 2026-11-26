# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Policy do
  @moduledoc """
  The one place that answers "may this member do this?" (ADR 0005, 0012).

  Three fixed roles. Moderators help run a community (invites, removing members,
  deleting messages, disconnecting people from voice) but cannot change its
  structure, roles or ownership, so a moderator can never take a community over.
  Acting on another person also needs a higher rank (`outranks?/2`).
  """

  alias Nosilence.Communities.Membership

  @type action ::
          :view
          | :join_voice
          | :send_message
          | :leave
          | :manage_invites
          | :remove_member
          | :delete_any_message
          | :mention_everyone
          | :disconnect_voice
          | :create_channel
          | :manage_channels
          | :manage_roles
          | :delete_community
          | :transfer_ownership

  @member [:view, :join_voice, :send_message, :leave]
  @moderator @member ++
               [
                 :manage_invites,
                 :remove_member,
                 :delete_any_message,
                 :disconnect_voice,
                 :mention_everyone
               ]

  @spec can?(Membership.t() | nil, action()) :: boolean()
  def can?(nil, _action), do: false
  def can?(%Membership{role: "owner"}, :leave), do: false
  def can?(%Membership{role: "owner"}, _action), do: true
  def can?(%Membership{role: "moderator"}, action), do: action in @moderator
  def can?(%Membership{role: "member"}, action), do: action in @member
  def can?(_membership, _action), do: false

  @doc "True if `actor` ranks above someone with `target_role` (owner > moderator > member)."
  def outranks?(%Membership{role: actor}, target_role), do: rank(actor) > rank(target_role)

  defp rank("owner"), do: 3
  defp rank("moderator"), do: 2
  defp rank("member"), do: 1
  defp rank(_), do: 0
end
