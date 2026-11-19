# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.CommunitiesTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.Communities
  alias Nosilence.Communities.Invite

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    %{owner: owner} |> Map.merge(community_fixture(owner))
  end

  describe "communities" do
    test "the creator is the owner and gets a General voice channel", %{
      owner: owner,
      community: c,
      channel: ch
    } do
      assert [%{community: %{id: id}, role: "owner"}] = Communities.list_communities(owner)
      assert id == c.id
      assert ch.name == "General"
      assert ch.kind == "voice"
      assert ch.capacity == 8
    end

    test "names are validated" do
      user = confirmed_user_fixture()
      assert {:error, cs} = Communities.create_community(user, %{"name" => "  "})
      assert %{name: ["can't be blank"]} = errors_on(cs)

      assert {:error, cs} =
               Communities.create_community(user, %{"name" => String.duplicate("x", 51)})

      assert %{name: _} = errors_on(cs)
    end

    test "non-members get not_found, never a hint that it exists", %{community: c} do
      stranger = confirmed_user_fixture()
      assert {:error, :not_found} = Communities.get_community(stranger, c.id)
      assert {:error, :not_found} = Communities.list_members(stranger, c.id)
      assert {:error, :not_found} = Communities.get_community(stranger, "not-a-uuid")
      assert Communities.list_communities(stranger) == []
    end

    test "only the owner can delete; the community is then gone for everyone", %{
      owner: owner,
      community: c
    } do
      member = confirmed_user_fixture()
      join_fixture(owner, c, member)

      assert {:error, :forbidden} = Communities.delete_community(member, c.id)
      assert :ok = Communities.delete_community(owner, c.id)
      assert {:error, :not_found} = Communities.get_community(member, c.id)
    end
  end

  describe "channels" do
    test "the owner creates voice channels; capacity defaults to 8 and is limited", %{
      owner: owner,
      community: c
    } do
      assert {:ok, ch} = Communities.create_channel(owner, c.id, %{"name" => "Oyun"})
      assert ch.capacity == 8

      assert {:ok, %{capacity: 4}} =
               Communities.create_channel(owner, c.id, %{"name" => "Small", "capacity" => 4})

      assert {:error, cs} =
               Communities.create_channel(owner, c.id, %{"name" => "Big", "capacity" => 9})

      assert %{capacity: _} = errors_on(cs)

      assert {:error, cs} =
               Communities.create_channel(owner, c.id, %{"name" => "Solo", "capacity" => 1})

      assert %{capacity: _} = errors_on(cs)
    end

    test "members cannot create channels", %{owner: owner, community: c} do
      member = confirmed_user_fixture()
      join_fixture(owner, c, member)
      assert {:error, :forbidden} = Communities.create_channel(member, c.id, %{"name" => "x"})
    end

    test "get_channel_for_voice/2 is for members only", %{owner: owner, community: c, channel: ch} do
      assert {:ok, %{id: id}} = Communities.get_channel_for_voice(owner, ch.id)
      assert id == ch.id

      stranger = confirmed_user_fixture()
      assert {:error, :not_found} = Communities.get_channel_for_voice(stranger, ch.id)
      assert {:error, :not_found} = Communities.get_channel_for_voice(owner, Ecto.UUID.generate())
      assert {:error, :not_found} = Communities.get_channel_for_voice(owner, "garbage")
      assert c
    end
  end

  describe "invites" do
    test "an invite makes a user a member, with the member role", %{owner: owner, community: c} do
      user = confirmed_user_fixture()
      assert {:ok, token, invite} = Communities.create_invite(owner, c.id)

      assert {:ok, %{community: %{name: "Nosilence Fans"}}} = Communities.preview_invite(token)
      assert {:ok, %{id: id}} = Communities.accept_invite(user, token)
      assert id == c.id
      assert [%{role: "member"}] = Communities.list_communities(user)
      assert Repo.reload!(invite).uses == 1
    end

    test "only the hash of the token is stored", %{owner: owner, community: c} do
      {:ok, token, invite} = Communities.create_invite(owner, c.id)
      {:ok, raw} = Base.url_decode64(token, padding: false)
      assert invite.token_hash == :crypto.hash(:sha256, raw)
    end

    test "default lifetime is 7 days; custom lifetimes are bounded", %{owner: owner, community: c} do
      {:ok, _, invite} = Communities.create_invite(owner, c.id)
      assert_in_delta DateTime.diff(invite.expires_at, DateTime.utc_now(), :hour), 168, 1

      assert {:error, {:invalid, "expires_in_hours"}} =
               Communities.create_invite(owner, c.id, %{"expires_in_hours" => 721})

      assert {:error, {:invalid, "max_uses"}} =
               Communities.create_invite(owner, c.id, %{"max_uses" => 0})

      assert {:error, {:invalid, "max_uses"}} =
               Communities.create_invite(owner, c.id, %{"max_uses" => "5"})
    end

    test "expired invites do not work", %{owner: owner, community: c} do
      {:ok, token, invite} = Communities.create_invite(owner, c.id)

      Repo.update_all(from(i in Invite, where: i.id == ^invite.id),
        set: [expires_at: DateTime.add(DateTime.utc_now(:second), -1)]
      )

      assert {:error, :invalid_invite} =
               Communities.accept_invite(confirmed_user_fixture(), token)

      assert {:error, :invalid_invite} = Communities.preview_invite(token)
    end

    test "max_uses is enforced", %{owner: owner, community: c} do
      {:ok, token, _} = Communities.create_invite(owner, c.id, %{"max_uses" => 1})
      assert {:ok, _} = Communities.accept_invite(confirmed_user_fixture(), token)

      assert {:error, :invalid_invite} =
               Communities.accept_invite(confirmed_user_fixture(), token)
    end

    test "accepting again as a member does not use up the invite", %{owner: owner, community: c} do
      user = confirmed_user_fixture()
      {:ok, token, invite} = Communities.create_invite(owner, c.id, %{"max_uses" => 2})
      {:ok, _} = Communities.accept_invite(user, token)
      {:ok, _} = Communities.accept_invite(user, token)
      assert Repo.reload!(invite).uses == 1
    end

    test "revoked invites stop working; only the owner manages invites", %{
      owner: owner,
      community: c
    } do
      member = confirmed_user_fixture()
      join_fixture(owner, c, member)
      {:ok, token, invite} = Communities.create_invite(owner, c.id)

      assert {:error, :forbidden} = Communities.create_invite(member, c.id)
      assert {:error, :not_found} = Communities.revoke_invite(member, invite.id)
      assert {:ok, [_ | _]} = Communities.list_invites(owner, c.id)

      assert :ok = Communities.revoke_invite(owner, invite.id)

      assert {:error, :invalid_invite} =
               Communities.accept_invite(confirmed_user_fixture(), token)
    end

    test "garbage tokens are rejected" do
      user = confirmed_user_fixture()
      assert {:error, :invalid_invite} = Communities.accept_invite(user, "nope")
      assert {:error, :invalid_invite} = Communities.accept_invite(user, nil)
    end
  end

  describe "members" do
    test "the owner can remove members but not themselves", %{owner: owner, community: c} do
      member = confirmed_user_fixture(%{"display_name" => "Member"})
      join_fixture(owner, c, member)

      assert {:ok,
              [%{display_name: "Owner", role: "owner"}, %{display_name: "Member", role: "member"}]} =
               Communities.list_members(owner, c.id)

      assert {:error, :forbidden} = Communities.remove_member(member, c.id, owner.id)
      assert {:error, :not_found} = Communities.remove_member(owner, c.id, owner.id)
      assert :ok = Communities.remove_member(owner, c.id, member.id)
      assert {:error, :not_found} = Communities.get_community(member, c.id)
    end

    test "members can leave; the owner cannot", %{owner: owner, community: c} do
      member = confirmed_user_fixture()
      join_fixture(owner, c, member)

      assert :ok = Communities.leave_community(member, c.id)
      assert Communities.list_communities(member) == []
      assert {:error, :forbidden} = Communities.leave_community(owner, c.id)
    end
  end
end
