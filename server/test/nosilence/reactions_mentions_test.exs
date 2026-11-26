# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.ReactionsMentionsTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Communities, Events, Messaging, Social}

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  defp reactions(user, channel_id) do
    {:ok, page} = Messaging.list_messages(user, channel_id)
    page.reactions
  end

  describe "reactions on channel messages" do
    test "each person once per emoji; the list says whose they are", ctx do
      {:ok, m} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hello")
      Phoenix.PubSub.subscribe(Nosilence.PubSub, Events.community_topic(ctx.community.id))

      assert :ok = Messaging.react(ctx.member, m.id, "👍", true)
      member_id = ctx.member.id

      assert_receive %Phoenix.Socket.Broadcast{
        event: "reaction_changed",
        payload: %{emoji: "👍", user_id: ^member_id, added: true}
      }

      # Again: nothing changes and nothing is announced.
      assert :ok = Messaging.react(ctx.member, m.id, "👍", true)
      refute_receive %Phoenix.Socket.Broadcast{event: "reaction_changed"}

      assert :ok = Messaging.react(ctx.owner, m.id, "👍", true)
      assert :ok = Messaging.react(ctx.owner, m.id, "🎉", true)

      assert %{
               m.id => [
                 %{emoji: "👍", count: 2, me: true},
                 %{emoji: "🎉", count: 1, me: false}
               ]
             } == reactions(ctx.member, ctx.text_channel.id)

      assert :ok = Messaging.react(ctx.member, m.id, "👍", false)

      assert %{m.id => [%{emoji: "👍", count: 1, me: false}, %{emoji: "🎉", count: 1, me: false}]} ==
               reactions(ctx.member, ctx.text_channel.id)
    end

    test "only emoji from the picker", ctx do
      {:ok, m} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hello")

      for bad <- ["a", "👍👍", "👍 ", "<b>", "", "\u202E"] do
        assert {:error, {:invalid, "emoji"}} = Messaging.react(ctx.member, m.id, bad, true)
      end

      # Joined emoji are one emoji.
      assert :ok = Messaging.react(ctx.member, m.id, "👨‍👩‍👧", true)
    end

    test "at most 20 different emoji on a message; existing ones can still be added", ctx do
      {:ok, m} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hello")
      emoji = ~w(😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙)

      for e <- emoji, do: assert(:ok = Messaging.react(ctx.owner, m.id, e, true))
      assert {:error, :reaction_limit} = Messaging.react(ctx.member, m.id, "🐱", true)
      assert :ok = Messaging.react(ctx.member, m.id, "😀", true)
    end

    test "only members of the community", ctx do
      {:ok, m} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hello")
      stranger = confirmed_user_fixture()
      assert {:error, :not_found} = Messaging.react(stranger, m.id, "👍", true)
      assert {:error, :not_found} = Messaging.react(ctx.member, Ecto.UUID.generate(), "👍", true)
    end

    test "deleting the message deletes its reactions", ctx do
      {:ok, m} = Messaging.send_message(ctx.owner, ctx.text_channel.id, "hello")
      :ok = Messaging.react(ctx.member, m.id, "👍", true)
      :ok = Messaging.delete_message(ctx.owner, m.id)
      assert Nosilence.Reactions.by_user(:channel, ctx.member.id) == []
    end
  end

  describe "mentions in channels" do
    test "the app's ids are kept for members; others are dropped", ctx do
      stranger = confirmed_user_fixture()

      assert {:ok, m} =
               Messaging.send_message(ctx.owner, ctx.text_channel.id, "hi @member", %{
                 "mentions" => [ctx.member.id, stranger.id, ctx.member.id]
               })

      assert m.mentions == [ctx.member.id]
      assert %{mentions: [_], mention: nil} = Messaging.to_payload(m)
    end

    test "everyone and here are for moderators and the owner", ctx do
      ch = ctx.text_channel.id

      assert {:error, :forbidden} =
               Messaging.send_message(ctx.member, ch, "@everyone", %{"mention" => "everyone"})

      assert {:ok, %{mention_scope: "here"}} =
               Messaging.send_message(ctx.owner, ch, "@here", %{"mention" => "here"})

      :ok = Communities.set_role(ctx.owner, ctx.community.id, ctx.member.id, "moderator")

      assert {:ok, %{mention_scope: "everyone"}} =
               Messaging.send_message(ctx.member, ch, "@everyone", %{"mention" => "everyone"})

      assert {:error, {:invalid, "mention"}} =
               Messaging.send_message(ctx.owner, ch, "@all", %{"mention" => "all"})
    end

    test "ids are checked; at most 20", ctx do
      ch = ctx.text_channel.id

      assert {:error, {:invalid, "mentions"}} =
               Messaging.send_message(ctx.owner, ch, "x", %{"mentions" => ["nope"]})

      assert {:error, {:invalid, "mentions"}} =
               Messaging.send_message(ctx.owner, ch, "x", %{"mentions" => "#{ctx.member.id}"})

      many = for _ <- 1..21, do: Ecto.UUID.generate()

      assert {:error, {:invalid, "mentions"}} =
               Messaging.send_message(ctx.owner, ch, "x", %{"mentions" => many})
    end

    test "an edit replaces the mentions", ctx do
      {:ok, m} =
        Messaging.send_message(ctx.owner, ctx.text_channel.id, "hi @member", %{
          "mentions" => [ctx.member.id]
        })

      assert {:ok, %{mentions: []}} = Messaging.edit_message(ctx.owner, m.id, "hi all", %{})
    end
  end

  describe "conversations" do
    setup ctx do
      for {u, name} <- [{ctx.owner, "owner"}, {ctx.member, "member"}],
          do: {:ok, _} = Social.set_username(u, name)

      {:ok, :requested} = Social.request_friend(ctx.owner, "member")
      :ok = Social.accept_friend(ctx.member, ctx.owner.id)
      {:ok, c} = Social.open_direct(ctx.owner, ctx.member.id)
      %{conversation: c}
    end

    test "reactions and mentions of conversation members", ctx do
      outsider = confirmed_user_fixture()

      {:ok, m} =
        Social.send_message(ctx.owner, ctx.conversation.id, "hey", %{
          "mentions" => [ctx.member.id, outsider.id]
        })

      assert m.mentions == [ctx.member.id]
      assert :ok = Social.react(ctx.member, m.id, "❤️", true)
      {:ok, page} = Social.list_messages(ctx.owner, ctx.conversation.id)
      assert page.reactions == %{m.id => [%{emoji: "❤️", count: 1, me: false}]}

      assert {:error, :not_found} = Social.react(outsider, m.id, "❤️", true)
    end

    test "no reactions once the direct conversation is blocked", ctx do
      {:ok, m} = Social.send_message(ctx.owner, ctx.conversation.id, "hey")
      :ok = Social.block(ctx.owner, ctx.member.id)
      assert {:error, :cannot_message} = Social.react(ctx.member, m.id, "👍", true)
    end
  end
end
