# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.MetricsTest do
  use NosilenceWeb.ConnCase, async: false

  import Nosilence.AccountsFixtures

  alias Nosilence.{Accounts, Metrics, Repo}

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(NosilenceWeb.UserAuth.cookie_name(), Accounts.create_session(user))
  end

  test "counters and measured values become daily totals with median and p95" do
    Metrics.count("voice_joins")
    Metrics.count("voice_joins")

    for ms <- [40, 45, 90, 120, 140, 160, 900, 80, 95, 30],
        do: Metrics.observe("call_join_ms", ms)

    summary = Metrics.summary(1)
    assert summary["voice_joins"] == %{count: 2}
    # 10 values: median in the 51-100 range, p95 in the 751-1000 range.
    assert summary["call_join_ms"] == %{count: 10, median: 100, p95: 1000}
  end

  test "rows hold no ids: only day, name, range and count" do
    Metrics.count("messages")

    assert Repo.query!("SELECT * FROM daily_metrics").columns |> Enum.sort() ==
             ["bucket", "count", "day", "name"]
  end

  test "rows older than 30 days are deleted" do
    Repo.insert_all("daily_metrics", [
      %{day: Date.add(Date.utc_today(), -31), name: "messages", bucket: 0, count: 5}
    ])

    Metrics.count("messages")
    assert Metrics.delete_expired() == 1
    assert Metrics.summary(60)["messages"] == %{count: 1}
  end

  test "call reports: validated, anonymous, rate limited" do
    user = confirmed_user_fixture()

    report = %{
      join_ms: 850,
      rtt_ms: 12,
      loss_pct: 0.4,
      concealed_pct: 1.5,
      duration_s: 300,
      reconnects: 1
    }

    assert authed(user) |> post(~p"/api/metrics/call", report) |> response(204)
    summary = Metrics.summary(1)
    assert summary["call_reports"] == %{count: 1}
    assert summary["call_reconnects"] == %{count: 1}
    assert summary["call_join_ms"].count == 1

    assert authed(user) |> post(~p"/api/metrics/call", %{rtt_ms: -5}) |> json_response(422)
    assert authed(user) |> post(~p"/api/metrics/call", %{loss_pct: "a lot"}) |> json_response(422)

    for _ <- 1..3, do: authed(user) |> post(~p"/api/metrics/call", %{rtt_ms: 10})
    assert authed(user) |> post(~p"/api/metrics/call", %{rtt_ms: 10}) |> json_response(429)
  end

  test "call reports need a signed-in user" do
    conn = build_conn() |> put_req_header("content-type", "application/json")
    assert conn |> post(~p"/api/metrics/call", %{rtt_ms: 10}) |> json_response(401)
  end
end
