# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.CommunityManagementTest do
  use Nosilence.DataCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.LiveKitStub

  alias Nosilence.{Communities, Messaging, Privacy}
  alias Nosilence.Communities.{Community, Membership, OwnershipTransfer, Policy, Succession}

  setup do
    room_with([])
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    mod = confirmed_user_fixture(%{"display_name" => "Mod"})
    a = confirmed_user_fixture(%{"display_name" => "A"})
    b = confirmed_user_fixture(%{"display_name" => "B"})
    fixture = community_fixture(owner, "Club")
    for u <- [mod, a, b], do: :ok = join_fixture(owner, fixture.community, u)
    :ok = Communities.set_role(owner, fixture.community.id, mod.id, "moderator")
    Map.merge(fixture, %{owner: owner, mod: mod, a: a, b: b})
  end

  defp role(c, user), do: Repo.get_by!(Membership, community_id: c.id, user_id: user.id).role

  describe "roles" do
    test "moderators help run the community but cannot change its structure", ctx do
      mod = %Membership{role: "moderator"}

      for allowed <- [:manage_invites, :remove_member, :delete_any_message, :disconnect_voice],
          do: assert(Policy.can?(mod, allowed))

      for denied <- [
            :create_channel,
            :manage_channels,
            :manage_roles,
            :delete_community,
            :transfer_ownership
          ],
          do: refute(Policy.can?(mod, denied))

      assert {:ok, _, _} = Communities.create_invite(ctx.mod, ctx.community.id)
    end

    test "moderators remove members, but not other moderators or the owner", ctx do
      other_mod = confirmed_user_fixture()
      :ok = join_fixture(ctx.owner, ctx.community, other_mod)
      :ok = Communities.set_role(ctx.owner, ctx.community.id, other_mod.id, "moderator")

      assert {:error, :forbidden} =
               Communities.remove_member(ctx.mod, ctx.community.id, other_mod.id)

      assert {:error, :forbidden} =
               Communities.remove_member(ctx.mod, ctx.community.id, ctx.owner.id)

      assert {:ok, _} = Communities.remove_member(ctx.mod, ctx.community.id, ctx.a.id)
    end

    test "only the owner sets roles, and never on the owner", ctx do
      assert {:error, :forbidden} =
               Communities.set_role(ctx.mod, ctx.community.id, ctx.a.id, "moderator")

      assert {:error, :forbidden} =
               Communities.set_role(ctx.owner, ctx.community.id, ctx.owner.id, "member")

      assert {:error, {:invalid, "role"}} =
               Communities.set_role(ctx.owner, ctx.community.id, ctx.a.id, "owner")

      assert :ok = Communities.set_role(ctx.owner, ctx.community.id, ctx.mod.id, "member")
      assert role(ctx.community, ctx.mod) == "member"
    end
  end

  describe "channels" do
    test "the owner renames, reorders and deletes channels", ctx do
      %{channel: voice, text_channel: text, community: c} = ctx
      assert {:ok, %{name: "Lobby"}} = Communities.rename_channel(ctx.owner, voice.id, "Lobby")
      assert {:error, :forbidden} = Communities.rename_channel(ctx.mod, voice.id, "Hijacked")

      assert :ok = Communities.reorder_channels(ctx.owner, c.id, [text.id, voice.id])
      {:ok, %{channels: channels}} = Communities.get_community(ctx.owner, c.id)
      assert Enum.map(channels, & &1.id) == [text.id, voice.id]

      assert {:error, {:invalid, "ids"}} =
               Communities.reorder_channels(ctx.owner, c.id, [text.id])

      {:ok, _} = Messaging.send_message(ctx.a, text.id, "bye")
      assert {:ok, _} = Communities.delete_channel(ctx.owner, text.id)
      assert Repo.all(Messaging.Message) == []
    end
  end

  describe "editing messages" do
    test "authors edit their own messages; the old text is not kept", ctx do
      {:ok, m} = Messaging.send_message(ctx.a, ctx.text_channel.id, "frist")
      assert {:ok, edited} = Messaging.edit_message(ctx.a, m.id, "first")
      assert edited.content == "first"
      assert edited.edited_at
      assert {:error, :forbidden} = Messaging.edit_message(ctx.owner, m.id, "owner edit")
      assert {:error, %Ecto.Changeset{}} = Messaging.edit_message(ctx.a, m.id, "  ")
      assert Messaging.to_payload(Repo.preload(edited, :author)).edited_at
    end

    test "a message can be edited at most three times", ctx do
      {:ok, m} = Messaging.send_message(ctx.a, ctx.text_channel.id, "v0")
      assert {:ok, _} = Messaging.edit_message(ctx.a, m.id, "v1")
      assert {:ok, _} = Messaging.edit_message(ctx.a, m.id, "v2")
      assert {:ok, third} = Messaging.edit_message(ctx.a, m.id, "v3")
      assert Messaging.to_payload(third).edits_left == 0
      assert {:error, :edit_limit} = Messaging.edit_message(ctx.a, m.id, "v4")
      assert Repo.get!(Messaging.Message, m.id).content == "v3"
    end
  end

  describe "ownership transfer (voluntary)" do
    test "offered in order: a declines, b accepts; the old owner becomes moderator", ctx do
      c = ctx.community
      assert {:ok, t} = Succession.offer(ctx.owner, c.id, [ctx.a.id, ctx.b.id])
      assert [%{community: %{name: "Club"}}] = Succession.offers_for(ctx.a)
      assert Succession.offers_for(ctx.b) == []

      # Only the current candidate can answer; a moderator cannot claim it.
      assert {:error, :not_found} = Succession.accept(ctx.b, t.id)
      assert {:error, :not_found} = Succession.accept(ctx.mod, t.id)

      :ok = Succession.decline(ctx.a, t.id)
      assert [_] = Succession.offers_for(ctx.b)
      :ok = Succession.accept(ctx.b, t.id)

      assert role(c, ctx.b) == "owner"
      assert role(c, ctx.owner) == "moderator"
      assert Repo.get!(OwnershipTransfer, t.id).status == "accepted"
    end

    test "the old owner's page is told at once that they are no longer owner", ctx do
      c = ctx.community
      Phoenix.PubSub.subscribe(Nosilence.PubSub, Nosilence.Events.community_topic(c.id))
      {:ok, t} = Succession.offer(ctx.owner, c.id, [ctx.a.id])
      :ok = Succession.accept(ctx.a, t.id)

      owner_id = ctx.owner.id
      a_id = ctx.a.id

      assert_received %Phoenix.Socket.Broadcast{
        event: "member_updated",
        payload: %{user_id: ^owner_id, role: "moderator"}
      }

      assert_received %Phoenix.Socket.Broadcast{
        event: "member_updated",
        payload: %{user_id: ^a_id, role: "owner"}
      }
    end

    test "a new owner cannot hand the community over again for 7 days", ctx do
      c = ctx.community
      {:ok, t} = Succession.offer(ctx.owner, c.id, [ctx.a.id])
      :ok = Succession.accept(ctx.a, t.id)

      assert {:error, {:handover_cooldown, until}} = Succession.offer(ctx.a, c.id, [ctx.b.id])
      assert DateTime.diff(until, DateTime.utc_now(), :hour) in 167..168
      assert {:ok, nil, ^until} = Succession.current(ctx.a, c.id)

      # Seven days later it is allowed again.
      Repo.update_all(OwnershipTransfer,
        set: [updated_at: DateTime.add(DateTime.utc_now(:second), -8, :day)]
      )

      assert {:ok, nil, nil} = Succession.current(ctx.a, c.id)
      assert {:ok, _} = Succession.offer(ctx.a, c.id, [ctx.b.id])
    end

    test "an unanswered offer moves on after its deadline; if nobody accepts, the owner stays",
         ctx do
      c = ctx.community
      {:ok, t} = Succession.offer(ctx.owner, c.id, [ctx.a.id])
      Succession.tick(DateTime.add(DateTime.utc_now(:second), 73, :hour))

      assert Repo.get!(OwnershipTransfer, t.id).status == "declined"
      assert role(c, ctx.owner) == "owner"
      assert Repo.get(Community, c.id)
    end

    test "candidates must be 1-3 distinct members other than the owner", ctx do
      c = ctx.community
      stranger = confirmed_user_fixture()

      for bad <- [
            [],
            [ctx.owner.id],
            [ctx.a.id, ctx.a.id],
            [stranger.id],
            [ctx.a.id, ctx.b.id, ctx.mod.id, ctx.a.id]
          ] do
        assert {:error, {:invalid, "candidates"}} = Succession.offer(ctx.owner, c.id, bad)
      end

      assert {:error, :forbidden} = Succession.offer(ctx.mod, c.id, [ctx.a.id])
    end

    test "a candidate who has left by their turn is skipped", ctx do
      c = ctx.community
      {:ok, t} = Succession.offer(ctx.owner, c.id, [ctx.b.id, ctx.a.id])
      :ok = Communities.leave_community(ctx.a, c.id)
      :ok = Succession.decline(ctx.b, t.id)

      assert Succession.offers_for(ctx.a) == []
      assert Repo.get!(OwnershipTransfer, t.id).status == "declined"
      assert role(c, ctx.owner) == "owner"
    end
  end

  describe "ownership transfer when the owner deletes their account" do
    defp delete_owner(ctx, candidates) do
      Privacy.delete_account(ctx.owner, %{
        "confirm_email" => ctx.owner.email,
        "password" => valid_password(),
        "hand_over" => %{ctx.community.id => candidates}
      })
    end

    test "the community waits without an owner; a candidate's acceptance saves it", ctx do
      c = ctx.community
      assert :ok = delete_owner(ctx, [ctx.a.id])
      assert Repo.get(Community, c.id)
      refute Repo.get_by(Membership, community_id: c.id, role: "owner")
      # Moderators keep their powers meanwhile.
      assert {:ok, _} = Communities.remove_member(ctx.mod, c.id, ctx.b.id)

      [%{id: id}] = Succession.offers_for(ctx.a)
      :ok = Succession.accept(ctx.a, id)
      assert role(c, ctx.a) == "owner"
    end

    test "if nobody accepts, members are warned and the community is deleted after 7 days", ctx do
      c = ctx.community
      assert :ok = delete_owner(ctx, [ctx.a.id])
      [%{id: id}] = Succession.offers_for(ctx.a)
      :ok = Succession.decline(ctx.a, id)

      t = Repo.get!(OwnershipTransfer, id)
      assert t.status == "deleting"
      assert DateTime.diff(t.delete_at, DateTime.utc_now(), :day) in 6..7

      assert {:ok, %{status: "deleting"}} =
               Succession.current(ctx.mod, c.id)
               |> Tuple.delete_at(2)

      Succession.tick(DateTime.add(DateTime.utc_now(:second), 6, :day))
      assert Repo.get(Community, c.id)
      Succession.tick(DateTime.add(DateTime.utc_now(:second), 8, :day))
      refute Repo.get(Community, c.id)
    end

    test "invalid candidates stop the deletion; nothing is deleted", ctx do
      assert {:error, :hand_over} = delete_owner(ctx, [confirmed_user_fixture().id])
      assert Repo.get(Nosilence.Accounts.User, ctx.owner.id)
      assert role(ctx.community, ctx.owner) == "owner"
    end

    test "communities without a hand-over are deleted with the account as before", ctx do
      assert :ok =
               Privacy.delete_account(ctx.owner, %{
                 "confirm_email" => ctx.owner.email,
                 "password" => valid_password()
               })

      refute Repo.get(Community, ctx.community.id)
    end
  end
end
