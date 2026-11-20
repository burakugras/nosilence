# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.ReadStateTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.Messaging

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    reader = confirmed_user_fixture(%{"display_name" => "Reader"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, reader)
    Map.merge(fixture, %{owner: owner, reader: reader})
  end

  defp say(user, ch, text) do
    {:ok, m} = Messaging.send_message(user, ch.id, text)
    m
  end

  test "messages keep the order they were sent in, even within one clock tick", ctx do
    # Two people take turns (one person would hit the message rate limit).
    ids =
      for i <- 1..20 do
        say(if(rem(i, 2) == 0, do: ctx.owner, else: ctx.reader), ctx.text_channel, "m#{i}").id
      end

    {:ok, page} = Messaging.list_messages(ctx.reader, ctx.text_channel.id)
    assert Enum.map(page.messages, & &1.id) == ids
  end

  test "unread counts come from others' messages after the read position", ctx do
    ch = ctx.text_channel
    first = say(ctx.owner, ch, "one")
    _ = say(ctx.owner, ch, "two")
    _ = say(ctx.owner, ch, "three")

    assert %{} = counts = Messaging.unread_counts(ctx.reader, [ch.id])
    assert counts[ch.id] == 3
    # The author's own messages are never unread for them.
    assert Messaging.unread_counts(ctx.owner, [ch.id])[ch.id] == 0

    assert :ok = Messaging.mark_read(ctx.reader, ch.id, first.id)
    assert Messaging.unread_counts(ctx.reader, [ch.id])[ch.id] == 2

    {:ok, page} = Messaging.list_messages(ctx.reader, ch.id)
    assert page.read.message_id == first.id
  end

  test "the read position only moves forward", ctx do
    ch = ctx.text_channel
    a = say(ctx.owner, ch, "a")
    b = say(ctx.owner, ch, "b")

    :ok = Messaging.mark_read(ctx.reader, ch.id, b.id)
    :ok = Messaging.mark_read(ctx.reader, ch.id, a.id)
    {:ok, page} = Messaging.list_messages(ctx.reader, ch.id)
    assert page.read.message_id == b.id
  end

  test "writing in a channel marks it read", ctx do
    ch = ctx.text_channel
    _ = say(ctx.owner, ch, "hello")
    assert Messaging.unread_counts(ctx.reader, [ch.id])[ch.id] == 1
    _ = say(ctx.reader, ch, "hi")
    assert Messaging.unread_counts(ctx.reader, [ch.id])[ch.id] == 0
  end

  test "counts stop at 100", ctx do
    ch = ctx.text_channel

    for i <- 1..105 do
      Repo.insert!(%Messaging.Message{
        channel_id: ch.id,
        author_id: ctx.owner.id,
        content: "#{i}"
      })
    end

    assert Messaging.unread_counts(ctx.reader, [ch.id])[ch.id] == 100
  end

  test "a message from another channel cannot be used, nor can strangers mark", ctx do
    other = community_fixture(ctx.owner, "Other")
    elsewhere = say(ctx.owner, other.text_channel, "elsewhere")

    assert {:error, :not_found} =
             Messaging.mark_read(ctx.reader, ctx.text_channel.id, elsewhere.id)

    mine = say(ctx.owner, ctx.text_channel, "here")

    assert {:error, :not_found} =
             Messaging.mark_read(confirmed_user_fixture(), ctx.text_channel.id, mine.id)
  end
end
