# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.PolicyTest do
  use ExUnit.Case, async: true

  alias Nosilence.Communities.{Membership, Policy}

  @owner %Membership{role: "owner"}
  @member %Membership{role: "member"}

  test "owners can do everything except leave" do
    for action <- [
          :view,
          :join_voice,
          :create_channel,
          :manage_invites,
          :remove_member,
          :delete_community
        ] do
      assert Policy.can?(@owner, action), "owner: #{action}"
    end

    refute Policy.can?(@owner, :leave)
  end

  test "members can view, join voice and leave, nothing else" do
    assert Policy.can?(@member, :view)
    assert Policy.can?(@member, :join_voice)
    assert Policy.can?(@member, :leave)

    for action <- [:create_channel, :manage_invites, :remove_member, :delete_community] do
      refute Policy.can?(@member, action), "member: #{action}"
    end
  end

  test "no membership, unknown roles and unknown actions are denied" do
    refute Policy.can?(nil, :view)
    refute Policy.can?(%Membership{role: "admin"}, :view)
    refute Policy.can?(@member, :something_new)
  end
end
