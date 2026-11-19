# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.MessagingTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Communities, Events, Messaging}
  alias Nosilence.Messaging.Message

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  defp texts(%{messages: messages}), do: Enum.map(messages, & &1.content)

  test "members send and read messages, oldest first", %{text_channel: ch} = ctx do
    {:ok, _} = Messaging.send_message(ctx.owner, ch.id, "first")
    {:ok, m} = Messaging.send_message(ctx.member, ch.id, "  second \n line  ")

    assert m.content == "second \n line"
    assert m.encryption == "none"
    assert {:ok, page} = Messaging.list_messages(ctx.member, ch.id)
    assert texts(page) == ["first", "second \n line"]
    refute page.has_more
  end

  test "history pages backwards with a cursor", %{text_channel: ch, owner: owner} do
    for i <- 1..55, do: {:ok, _} = Messaging.send_message(owner, ch.id, "m#{i}")

    {:ok, latest} = Messaging.list_messages(owner, ch.id)
    assert length(latest.messages) == 50
    assert latest.has_more
    assert List.last(texts(latest)) == "m55"

    {:ok, older} = Messaging.list_messages(owner, ch.id, %{"before" => hd(latest.messages).id})
    assert texts(older) == ["m1", "m2", "m3", "m4", "m5"]
    refute older.has_more

    assert {:error, {:invalid, "before"}} =
             Messaging.list_messages(owner, ch.id, %{"before" => "nonsense"})
  end

  test "strangers and removed members cannot read or write", %{text_channel: ch} = ctx do
    stranger = confirmed_user_fixture()
    assert {:error, :not_found} = Messaging.list_messages(stranger, ch.id)
    assert {:error, :not_found} = Messaging.send_message(stranger, ch.id, "hi")

    {:ok, _} = Communities.remove_member(ctx.owner, ctx.community.id, ctx.member.id)
    assert {:error, :not_found} = Messaging.list_messages(ctx.member, ch.id)
  end

  test "voice channels do not take messages", %{channel: voice, owner: owner} do
    assert {:error, :not_found} = Messaging.send_message(owner, voice.id, "hi")
    assert {:error, :not_found} = Messaging.list_messages(owner, voice.id)
  end

  test "text is validated", %{text_channel: ch, owner: owner} do
    for bad <- [
          "",
          "   ",
          nil,
          42,
          String.duplicate("a", 2001),
          "a\u0007b",
          "evil" <> <<0x202E::utf8>> <> "txt.exe"
        ] do
      assert {:error, %Ecto.Changeset{}} = Messaging.send_message(owner, ch.id, bad)
    end

    assert {:ok, _} = Messaging.send_message(owner, ch.id, String.duplicate("ş", 2000))
    assert {:ok, _} = Messaging.send_message(owner, ch.id, "family 👨‍👩‍👧 emoji\ttab")
  end

  test "authors delete their own messages, the owner deletes any", %{text_channel: ch} = ctx do
    {:ok, by_owner} = Messaging.send_message(ctx.owner, ch.id, "owner")
    {:ok, by_member} = Messaging.send_message(ctx.member, ch.id, "member")
    {:ok, by_member2} = Messaging.send_message(ctx.member, ch.id, "member 2")

    assert {:error, :forbidden} = Messaging.delete_message(ctx.member, by_owner.id)
    assert :ok = Messaging.delete_message(ctx.member, by_member.id)
    assert :ok = Messaging.delete_message(ctx.owner, by_member2.id)
    assert {:error, :not_found} = Messaging.delete_message(confirmed_user_fixture(), by_owner.id)
    assert {:error, :not_found} = Messaging.delete_message(ctx.owner, by_member.id)
    assert [%Message{content: "owner"}] = Repo.all(Message)
  end

  test "new and deleted messages are announced to the community", %{text_channel: ch} = ctx do
    Phoenix.PubSub.subscribe(Nosilence.PubSub, Events.community_topic(ctx.community.id))

    {:ok, m} = Messaging.send_message(ctx.member, ch.id, "hello")

    assert_receive %Phoenix.Socket.Broadcast{
      event: "message_created",
      payload: %{id: id, text: "hello", author: %{display_name: "Member"}}
    }

    assert id == m.id
    :ok = Messaging.delete_message(ctx.member, m.id)
    assert_receive %Phoenix.Socket.Broadcast{event: "message_deleted", payload: %{id: ^id}}
  end

  test "deleting a channel's community deletes its messages",
       %{text_channel: ch, owner: owner} = ctx do
    {:ok, _} = Messaging.send_message(owner, ch.id, "bye")
    {:ok, _} = Communities.delete_community(owner, ctx.community.id)
    assert Repo.all(Message) == []
  end
end
