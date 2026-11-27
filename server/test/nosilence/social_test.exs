# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.SocialTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.Social

  defp named(name) do
    user = confirmed_user_fixture(%{"display_name" => String.capitalize(name)})
    {:ok, user} = Social.set_username(user, name)
    user
  end

  defp friends(a, b) do
    {:ok, :requested} = Social.request_friend(a, b.username)
    :ok = Social.accept_friend(b, a.id)
  end

  setup do
    %{ayse: named("ayse"), cem: named("cem"), deniz: named("deniz")}
  end

  describe "usernames" do
    test "unique regardless of case, with simple characters", ctx do
      user = confirmed_user_fixture()
      assert {:error, cs} = Social.set_username(user, "AYSE")
      assert "is taken" in errors_on(cs).username
      assert {:ok, %{username: "ayse.k"}} = Social.set_username(user, "  Ayse.K ")

      for bad <- ["ab", "a b", "ayşe", ".dot", "dot.", "a..b", "admin", String.duplicate("a", 33)] do
        assert {:error, _} = Social.set_username(user, bad), bad
      end

      assert ctx.ayse.username == "ayse"
    end
  end

  describe "friends" do
    test "a request by username, accepted; asking back accepts at once", ctx do
      assert {:ok, :requested} = Social.request_friend(ctx.ayse, "@CEM")
      assert %{outgoing: [%{username: "cem"}]} = Social.list_friends(ctx.ayse)
      assert %{incoming: [%{username: "ayse"}]} = Social.list_friends(ctx.cem)

      assert {:ok, :accepted} = Social.request_friend(ctx.cem, "ayse")

      assert %{friends: [%{username: "cem"}], incoming: [], outgoing: []} =
               Social.list_friends(ctx.ayse)

      assert {:error, :already_friends} = Social.request_friend(ctx.ayse, "cem")

      :ok = Social.remove_friend(ctx.cem, ctx.ayse.id)
      assert %{friends: []} = Social.list_friends(ctx.ayse)
    end

    test "unknown, self and blocked look the same", ctx do
      assert {:error, :cannot_request} = Social.request_friend(ctx.ayse, "nobody")
      assert {:error, :cannot_request} = Social.request_friend(ctx.ayse, "ayse")

      :ok = Social.block(ctx.cem, ctx.ayse.id)
      assert {:error, :cannot_request} = Social.request_friend(ctx.ayse, "cem")
      # The blocker cannot ask either while the block stands.
      assert {:error, :cannot_request} = Social.request_friend(ctx.cem, "ayse")
    end

    test "people who accept requests only from their communities", ctx do
      {:ok, _} = Social.update_privacy(ctx.cem, %{friend_requests_from: "communities"})
      assert {:error, :cannot_request} = Social.request_friend(ctx.ayse, "cem")

      %{community: c} = community_fixture(ctx.cem)
      :ok = join_fixture(ctx.cem, c, ctx.ayse)
      assert {:ok, :requested} = Social.request_friend(ctx.ayse, {:id, ctx.cem.id})
    end

    test "at most 20 requests an hour", ctx do
      for i <- 1..20, do: Social.request_friend(ctx.ayse, named("person#{i}").username)
      assert {:error, :too_many_requests} = Social.request_friend(ctx.ayse, "deniz")
    end

    test "blocking ends a friendship; unblocking does not restore it", ctx do
      friends(ctx.ayse, ctx.cem)
      :ok = Social.block(ctx.ayse, ctx.cem.id)
      assert %{friends: [], blocked: [%{username: "cem"}]} = Social.list_friends(ctx.ayse)
      assert %{friends: []} = Social.list_friends(ctx.cem)

      :ok = Social.unblock(ctx.ayse, ctx.cem.id)
      assert %{friends: [], blocked: []} = Social.list_friends(ctx.ayse)
    end
  end

  describe "direct conversations" do
    test "with friends; one conversation per pair", ctx do
      assert {:error, :cannot_message} = Social.open_direct(ctx.ayse, ctx.cem.id)
      friends(ctx.ayse, ctx.cem)
      assert {:ok, c} = Social.open_direct(ctx.ayse, ctx.cem.id)
      assert {:ok, %{id: same}} = Social.open_direct(ctx.cem, ctx.ayse.id)
      assert same == c.id
    end

    test "with people in a shared community, unless they turned it off", ctx do
      %{community: c} = community_fixture(ctx.ayse)
      :ok = join_fixture(ctx.ayse, c, ctx.cem)
      assert {:ok, _} = Social.open_direct(ctx.ayse, ctx.cem.id)

      {:ok, _} = Social.update_privacy(ctx.deniz, %{community_members_can_message: false})
      :ok = join_fixture(ctx.ayse, c, ctx.deniz)
      assert {:error, :cannot_message} = Social.open_direct(ctx.ayse, ctx.deniz.id)
    end

    test "messages, unread counts and read position; others cannot read", ctx do
      friends(ctx.ayse, ctx.cem)
      {:ok, c} = Social.open_direct(ctx.ayse, ctx.cem.id)
      Phoenix.PubSub.subscribe(Nosilence.PubSub, Nosilence.Events.user_topic(ctx.cem.id))

      {:ok, m1} = Social.send_message(ctx.ayse, c.id, "  merhaba ")
      {:ok, _m2} = Social.send_message(ctx.ayse, c.id, "orada mısın?")
      assert m1.content == "merhaba"
      assert_received %Phoenix.Socket.Broadcast{event: "dm_created", payload: %{text: "merhaba"}}

      assert [%{id: id, unread: 2, members: members}] = Social.list_conversations(ctx.cem)
      assert id == c.id
      assert Enum.map(members, & &1.username) |> Enum.sort() == ["ayse", "cem"]
      assert [%{unread: 0}] = Social.list_conversations(ctx.ayse)

      :ok = Social.mark_read(ctx.cem, c.id, m1.id)
      assert [%{unread: 1}] = Social.list_conversations(ctx.cem)
      {:ok, page} = Social.list_messages(ctx.cem, c.id)
      assert Enum.map(page.messages, & &1.content) == ["merhaba", "orada mısın?"]
      assert page.read.message_id == m1.id

      assert {:error, :not_found} = Social.list_messages(ctx.deniz, c.id)
      assert {:error, :not_found} = Social.send_message(ctx.deniz, c.id, "hi")
    end

    test "after a block nobody can write, but the history stays", ctx do
      friends(ctx.ayse, ctx.cem)
      {:ok, c} = Social.open_direct(ctx.ayse, ctx.cem.id)
      {:ok, _} = Social.send_message(ctx.cem, c.id, "selam")

      :ok = Social.block(ctx.ayse, ctx.cem.id)
      assert {:error, :cannot_message} = Social.send_message(ctx.cem, c.id, "hey")
      assert {:error, :cannot_message} = Social.send_message(ctx.ayse, c.id, "hey")
      assert {:ok, %{messages: [_]}} = Social.list_messages(ctx.cem, c.id)
      assert {:error, :cannot_message} = Social.open_direct(ctx.cem, ctx.ayse.id)
    end

    test "authors edit (three times) and delete their own messages only", ctx do
      friends(ctx.ayse, ctx.cem)
      {:ok, c} = Social.open_direct(ctx.ayse, ctx.cem.id)
      {:ok, m} = Social.send_message(ctx.ayse, c.id, "v0")

      assert {:error, :forbidden} = Social.edit_message(ctx.cem, m.id, "nope")
      for v <- 1..3, do: assert({:ok, _} = Social.edit_message(ctx.ayse, m.id, "v#{v}"))
      assert {:error, :edit_limit} = Social.edit_message(ctx.ayse, m.id, "v4")

      assert {:error, :forbidden} = Social.delete_message(ctx.cem, m.id)
      assert :ok = Social.delete_message(ctx.ayse, m.id)
      assert {:ok, %{messages: []}} = Social.list_messages(ctx.ayse, c.id)
    end
  end

  describe "groups" do
    setup ctx do
      friends(ctx.ayse, ctx.cem)
      friends(ctx.ayse, ctx.deniz)
      :ok
    end

    test "only with friends, two to nine others", ctx do
      stranger = named("eda")
      assert {:error, {:invalid, "members"}} = Social.create_group(ctx.ayse, [ctx.cem.id])

      assert {:error, {:invalid, "members"}} =
               Social.create_group(ctx.ayse, [ctx.cem.id, stranger.id])

      assert {:ok, g} = Social.create_group(ctx.ayse, [ctx.cem.id, ctx.deniz.id], " Ekip ")
      assert g.name == "Ekip"
      assert [%{kind: "group", members: [_, _, _]}] = Social.list_conversations(ctx.deniz)
    end

    test "members add their own friends, up to ten in all", ctx do
      {:ok, g} = Social.create_group(ctx.ayse, [ctx.cem.id, ctx.deniz.id])
      others = for i <- 1..8, do: named("friend#{i}")
      Enum.each(others, &friends(ctx.ayse, &1))

      assert {:error, {:invalid, "members"}} =
               Social.add_members(ctx.ayse, g.id, Enum.map(others, & &1.id))

      assert :ok = Social.add_members(ctx.ayse, g.id, Enum.map(Enum.take(others, 7), & &1.id))
      # Cem is not friends with them.
      assert {:error, {:invalid, "members"}} =
               Social.add_members(ctx.cem, g.id, [List.last(others).id])
    end

    test "leaving, removing (creator only), and the last one out deletes it", ctx do
      {:ok, g} = Social.create_group(ctx.ayse, [ctx.cem.id, ctx.deniz.id])
      assert {:error, :forbidden} = Social.remove_member(ctx.cem, g.id, ctx.deniz.id)
      assert :ok = Social.remove_member(ctx.ayse, g.id, ctx.deniz.id)
      assert Social.list_conversations(ctx.deniz) == []

      assert :ok = Social.remove_member(ctx.cem, g.id, ctx.cem.id)
      assert :ok = Social.remove_member(ctx.ayse, g.id, ctx.ayse.id)
      refute Repo.get(Nosilence.Social.Conversation, g.id)
    end

    test "renaming, by any member", ctx do
      {:ok, g} = Social.create_group(ctx.ayse, [ctx.cem.id, ctx.deniz.id])
      assert :ok = Social.rename_group(ctx.cem, g.id, "Yeni")
      assert [%{name: "Yeni"}] = Social.list_conversations(ctx.ayse)

      assert {:error, {:invalid, "name"}} =
               Social.rename_group(ctx.cem, g.id, String.duplicate("x", 51))
    end
  end

  describe "replies (ADR 0015 amendment)" do
    test "someone who wrote to the user gets their reply, whatever their own setting", ctx do
      # Ayşe and Cem share a community but are not friends. Ayşe takes no
      # messages from community members, Cem does.
      %{community: community} = community_fixture(ctx.ayse)
      :ok = join_fixture(ctx.ayse, community, ctx.cem)
      {:ok, ayse} = Social.update_privacy(ctx.ayse, %{"community_members_can_message" => false})

      # Cem cannot start a conversation with Ayşe.
      assert {:error, :cannot_message} = Social.open_direct(ctx.cem, ayse.id)

      # Ayşe writes to Cem: Cem may answer, and open the conversation again.
      {:ok, c} = Social.open_direct(ayse, ctx.cem.id)
      [%{can_write: false}] = Social.list_conversations(ctx.cem)
      {:ok, _} = Social.send_message(ayse, c.id, "hi Cem")
      assert [%{can_write: true}] = Social.list_conversations(ctx.cem)
      assert {:ok, _} = Social.send_message(ctx.cem, c.id, "hi Ayşe")
      assert {:ok, %{id: same}} = Social.open_direct(ctx.cem, ayse.id)
      assert same == c.id

      # A block always wins.
      :ok = Social.block(ayse, ctx.cem.id)
      assert {:error, :cannot_message} = Social.send_message(ctx.cem, c.id, "still?")
      assert [%{can_write: false}] = Social.list_conversations(ctx.cem)
    end
  end
end
