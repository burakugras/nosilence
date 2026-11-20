# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.RetentionTest do
  use Nosilence.DataCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.{Accounts, Communities, Retention, TrafficLog}
  alias Nosilence.Accounts.UserToken
  alias Nosilence.Communities.Invite

  defp age(schema, id, by), do: age(schema, id, :inserted_at, by)

  defp age(schema, id, field, by) do
    at = DateTime.add(DateTime.utc_now(:second), -by, :second)
    Repo.update_all(from(r in schema, where: r.id == ^id), set: [{field, at}])
  end

  test "deletes each kind of token after its own lifetime, and nothing younger" do
    user = confirmed_user_fixture()
    fresh = Accounts.create_session(user)
    old = Accounts.create_session(user)
    old_row = Repo.one(UserToken.by_token_query(old, "session"))
    age(UserToken, old_row.id, 61 * 86_400)

    {_, reset} = UserToken.build(user, "reset_password", user.email)
    reset = Repo.insert!(reset)
    age(UserToken, reset.id, 2 * 3600)

    assert %{tokens: 2} = Retention.run() |> Map.take([:tokens])
    assert Accounts.get_user_by_session(fresh)
    refute Accounts.get_user_by_session(old)
  end

  test "deletes invites that ended more than 30 days ago" do
    owner = confirmed_user_fixture()
    %{community: c} = community_fixture(owner)
    {:ok, _, active} = Communities.create_invite(owner, c.id)
    {:ok, _, expired} = Communities.create_invite(owner, c.id)
    age(Invite, expired.id, :expires_at, 31 * 86_400)
    {:ok, _, recent} = Communities.create_invite(owner, c.id)
    age(Invite, recent.id, :expires_at, 5 * 86_400)

    assert %{invites: 1} = Retention.run() |> Map.take([:invites])
    assert Repo.get(Invite, active.id)
    assert Repo.get(Invite, recent.id)
    refute Repo.get(Invite, expired.id)
  end

  test "traffic records: address encrypted at rest, kept a year, then deleted" do
    user = confirmed_user_fixture()
    :ok = TrafficLog.record(user.id, "sign_in", {{203, 0, 113, 7}, 51_234})

    [row] = Repo.all(TrafficLog)
    refute row.encrypted_address =~ "203.0.113.7"
    assert [%{event: "sign_in", address: "203.0.113.7 51234"}] = TrafficLog.for_user(user.id)

    # Moving the ciphertext to another account's row makes it unreadable.
    Repo.update_all(TrafficLog, set: [user_id: Ecto.UUID.generate()])
    [moved] = Repo.all(TrafficLog)
    assert [%{address: nil}] = TrafficLog.for_user(moved.user_id)

    age(TrafficLog, moved.id, 364 * 86_400)
    assert %{traffic_logs: 0} = Retention.run() |> Map.take([:traffic_logs])
    age(TrafficLog, moved.id, 366 * 86_400)
    assert %{traffic_logs: 1} = Retention.run() |> Map.take([:traffic_logs])
  end
end
