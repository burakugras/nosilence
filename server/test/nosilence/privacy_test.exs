# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.PrivacyTest do
  use Nosilence.DataCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.LiveKitStub

  alias Nosilence.{Accounts, Communities, Messaging, Privacy, TrafficLog}
  alias Nosilence.Accounts.User
  alias Nosilence.Communities.Community
  alias Nosilence.Messaging.Message

  setup do
    room_with([])
    leaver = confirmed_user_fixture(%{"display_name" => "Leaver"})
    friend = confirmed_user_fixture(%{"display_name" => "Friend"})

    # A community the leaver owns, and one where they are only a member.
    owned = community_fixture(leaver, "Leaver's")
    :ok = join_fixture(leaver, owned.community, friend)
    other = community_fixture(friend, "Friend's")
    :ok = join_fixture(friend, other.community, leaver)

    {:ok, kept} = Messaging.send_message(leaver, other.text_channel.id, "my words")
    {:ok, _} = Messaging.send_message(friend, other.text_channel.id, "a reply")

    %{leaver: leaver, friend: friend, owned: owned, other: other, kept: kept}
  end

  defp confirm(user, extra \\ %{}),
    do: Map.merge(%{"confirm_email" => user.email, "password" => valid_password()}, extra)

  test "the preview lists owned communities with their member counts", ctx do
    assert %{owned_communities: [%{name: "Leaver's", member_count: 2}], needs_password: true} =
             Privacy.deletion_preview(ctx.leaver)
  end

  test "deletion needs the email typed and, for password accounts, the password", ctx do
    assert {:error, :confirm_email} =
             Privacy.delete_account(ctx.leaver, %{"confirm_email" => "x"})

    assert {:error, :password} =
             Privacy.delete_account(ctx.leaver, confirm(ctx.leaver, %{"password" => "wrong"}))

    assert Repo.get(User, ctx.leaver.id)
  end

  test "by default messages stay, from a deleted user; owned communities go", ctx do
    session = Accounts.create_session(ctx.leaver)
    :ok = TrafficLog.record(ctx.leaver.id, "sign_in", {{127, 0, 0, 1}, 5000})

    assert :ok = Privacy.delete_account(ctx.leaver, confirm(ctx.leaver))

    refute Repo.get(User, ctx.leaver.id)
    refute Accounts.get_user_by_session(session)
    refute Repo.get(Community, ctx.owned.community.id)
    assert {:ok, members} = Communities.list_members(ctx.friend, ctx.other.community.id)
    assert Enum.map(members, & &1.display_name) == ["Friend"]

    # The conversation keeps its flow: the message is there, with no author.
    assert %Message{author_id: nil, content: "my words"} = Repo.get(Message, ctx.kept.id)
    # Legally required traffic records outlive the account.
    assert [_] = TrafficLog.for_user(ctx.leaver.id)
  end

  test "when asked, the user's messages are deleted too, and only theirs", ctx do
    assert :ok =
             Privacy.delete_account(ctx.leaver, confirm(ctx.leaver, %{"delete_messages" => true}))

    refute Repo.get(Message, ctx.kept.id)
    assert [%Message{content: "a reply"}] = Repo.all(Message)
  end

  test "accounts without a password (Google) confirm with the email only", ctx do
    {:ok, google} =
      Accounts.register_google_user(
        %{sub: "g-del", email: "g.del@example.com", name: "G"},
        %{"display_name" => "G", "age_confirmed" => true}
      )

    assert :ok = Privacy.delete_account(google, %{"confirm_email" => "G.DEL@example.com"})
    assert ctx.friend
  end

  test "the export holds the account, memberships, messages and traffic records", ctx do
    :ok = TrafficLog.record(ctx.leaver.id, "connect", {{198, 51, 100, 4}, 6000})
    export = Privacy.export(ctx.leaver)

    assert export.account.email == ctx.leaver.email
    refute Map.has_key?(export.account, :hashed_password)
    assert Enum.map(export.memberships, & &1.role) |> Enum.sort() == ["member", "owner"]
    assert [%{text: "my words", community: "Friend's", channel: "general"}] = export.messages
    assert [%{event: "connect", address: "198.51.100.4 6000"}] = export.traffic_records
    assert Jason.encode!(export)
  end
end
