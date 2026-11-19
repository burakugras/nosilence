# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Policy do
  @moduledoc """
  The one place that answers "may this member do this?".

  Adding a role (for example a moderator) means changing this module only.
  """

  alias Nosilence.Communities.Membership

  @type action ::
          :view
          | :join_voice
          | :send_message
          | :leave
          | :create_channel
          | :manage_invites
          | :remove_member
          | :delete_community
          | :delete_any_message

  @owner_only [
    :create_channel,
    :manage_invites,
    :remove_member,
    :delete_community,
    :delete_any_message
  ]
  @member [:view, :join_voice, :send_message, :leave]

  @spec can?(Membership.t() | nil, action()) :: boolean()
  def can?(nil, _action), do: false
  def can?(%Membership{role: "owner"}, :leave), do: false
  def can?(%Membership{role: "owner"}, _action), do: true
  def can?(%Membership{role: "member"}, action) when action in @owner_only, do: false

  def can?(%Membership{role: "member"}, action) when action in @member, do: true

  def can?(_membership, _action), do: false
end
