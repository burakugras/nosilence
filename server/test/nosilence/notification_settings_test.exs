# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.NotificationSettingsTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Messaging, NotificationSettings, Social}

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  test "a channel's own level comes before its community's; the default is all", ctx do
    %{community: c, text_channel: ch, member: m} = ctx
    assert NotificationSettings.level(m.id, c.id, ch.id) == "all"

    :ok = NotificationSettings.put(m, "community", c.id, %{"level" => "none"})
    assert NotificationSettings.level(m.id, c.id, ch.id) == "none"

    :ok = NotificationSettings.put(m, "channel", ch.id, %{"level" => "mentions"})
    assert NotificationSettings.level(m.id, c.id, ch.id) == "mentions"

    :ok = NotificationSettings.clear(m, "channel", ch.id)
    assert NotificationSettings.level(m.id, c.id, ch.id) == "none"

    # Another person's settings are their own.
    assert NotificationSettings.level(ctx.owner.id, c.id, ch.id) == "all"
    assert [%{type: "community", level: "none", until: nil}] = NotificationSettings.list(m)
  end

  test "a level with an end applies until then", ctx do
    %{community: c, text_channel: ch, member: m} = ctx
    soon = DateTime.utc_now() |> DateTime.add(3600) |> DateTime.to_iso8601()
    :ok = NotificationSettings.put(m, "community", c.id, %{"level" => "none", "until" => soon})
    assert NotificationSettings.level(m.id, c.id, ch.id) == "none"

    # Ended: as if there were none.
    Nosilence.Repo.update_all(NotificationSettings.Setting,
      set: [until: DateTime.utc_now() |> DateTime.add(-60) |> DateTime.truncate(:second)]
    )

    assert NotificationSettings.level(m.id, c.id, ch.id) == "all"
    assert NotificationSettings.list(m) == []
  end

  test "only for what the user belongs to; values are checked", ctx do
    stranger = confirmed_user_fixture()
    %{community: c, text_channel: ch, channel: voice} = ctx

    assert {:error, :not_found} =
             NotificationSettings.put(stranger, "community", c.id, %{"level" => "none"})

    assert {:error, :not_found} =
             NotificationSettings.put(stranger, "channel", ch.id, %{"level" => "none"})

    # Voice channels have no messages to notify about.
    assert {:error, :not_found} =
             NotificationSettings.put(ctx.member, "channel", voice.id, %{"level" => "none"})

    assert {:error, {:invalid, "type"}} =
             NotificationSettings.put(ctx.member, "server", c.id, %{"level" => "none"})

    assert {:error, %Ecto.Changeset{}} =
             NotificationSettings.put(ctx.member, "community", c.id, %{"level" => "loud"})

    past = DateTime.utc_now() |> DateTime.add(-60) |> DateTime.to_iso8601()

    assert {:error, %Ecto.Changeset{}} =
             NotificationSettings.put(ctx.member, "community", c.id, %{
               "level" => "none",
               "until" => past
             })
  end

  test "conversations the user is in", ctx do
    for {u, name} <- [{ctx.owner, "owner"}, {ctx.member, "member"}],
        do: {:ok, _} = Social.set_username(u, name)

    {:ok, :requested} = Social.request_friend(ctx.owner, "member")
    :ok = Social.accept_friend(ctx.member, ctx.owner.id)
    {:ok, conversation} = Social.open_direct(ctx.owner, ctx.member.id)

    assert :ok =
             NotificationSettings.put(ctx.member, "conversation", conversation.id, %{
               "level" => "mentions"
             })

    assert {:error, :not_found} =
             NotificationSettings.put(
               confirmed_user_fixture(),
               "conversation",
               conversation.id,
               %{
                 "level" => "none"
               }
             )
  end

  test "unread mentions are counted per channel", ctx do
    %{text_channel: ch, owner: o, member: m} = ctx
    {:ok, _} = Messaging.send_message(o, ch.id, "plain")
    {:ok, _} = Messaging.send_message(o, ch.id, "hi @member", %{"mentions" => [m.id]})
    {:ok, last} = Messaging.send_message(o, ch.id, "@here", %{"mention" => "here"})

    assert Messaging.mention_counts(m, [ch.id]) == %{ch.id => 2}
    # The author's own messages never count.
    assert Messaging.mention_counts(o, [ch.id]) == %{ch.id => 0}

    :ok = Messaging.mark_read(m, ch.id, last.id)
    assert Messaging.mention_counts(m, [ch.id]) == %{ch.id => 0}
  end

  test "who reacted: names and the total, for members only", ctx do
    %{text_channel: ch, owner: o, member: m} = ctx
    {:ok, msg} = Messaging.send_message(o, ch.id, "hello")
    :ok = Messaging.react(m, msg.id, "👍", true)
    :ok = Messaging.react(o, msg.id, "👍", true)

    assert {:ok, %{names: ["Member", "Owner"], total: 2}} = Messaging.reactors(m, msg.id, "👍")
    assert {:ok, %{names: [], total: 0}} = Messaging.reactors(m, msg.id, "🎉")
    assert {:error, :not_found} = Messaging.reactors(confirmed_user_fixture(), msg.id, "👍")
  end
end
