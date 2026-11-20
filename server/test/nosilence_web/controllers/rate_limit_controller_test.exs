# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.RateLimitControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Swoosh.TestAssertions

  alias Nosilence.Accounts

  defp json_conn, do: build_conn() |> put_req_header("content-type", "application/json")

  test "sign-in: five tries per email address and minute, then 429 with Retry-After" do
    user = confirmed_user_fixture()

    for _ <- 1..5 do
      conn = json_conn() |> post(~p"/api/session", %{email: user.email, password: "wrong"})
      assert json_response(conn, 401)
    end

    # Even the right password waits now: the limit is per address, not per failure.
    conn =
      json_conn()
      |> post(~p"/api/session", %{email: String.upcase(user.email), password: valid_password()})

    assert %{"error" => "Too many sign-in attempts. Try again in " <> _} =
             json_response(conn, 429)

    assert [seconds] = get_resp_header(conn, "retry-after")
    assert String.to_integer(seconds) in 1..60
  end

  test "password reset emails: three per address and hour, same answer afterwards" do
    user = confirmed_user_fixture()
    # The fixture's confirmation email counts too; drain the mailbox first.
    Process.sleep(10)
    flush_emails()

    for _ <- 1..2 do
      conn = json_conn() |> post(~p"/api/accounts/password-reset", %{email: user.email})
      assert json_response(conn, 202)
      assert_email_sent()
    end

    conn = json_conn() |> post(~p"/api/accounts/password-reset", %{email: user.email})
    # Same answer as always (no account enumeration), but no email.
    assert json_response(conn, 202)
    refute_email_sent()
  end

  test "messages: ten per user in ten seconds, then a 30 second pause" do
    owner = confirmed_user_fixture()
    %{text_channel: ch} = community_fixture(owner)
    token = Accounts.create_session(owner)
    authed = fn -> json_conn() |> put_req_header("authorization", "Bearer " <> token) end

    for i <- 1..10 do
      assert authed.()
             |> post(~p"/api/channels/#{ch.id}/messages", %{text: "m#{i}"})
             |> json_response(201)
    end

    conn = authed.() |> post(~p"/api/channels/#{ch.id}/messages", %{text: "one more"})

    assert %{"error" => "You are sending messages too fast. Try again in 30 seconds."} =
             json_response(conn, 429)

    assert get_resp_header(conn, "retry-after") == ["30"]
  end

  defp flush_emails do
    receive do
      {:email, _} -> flush_emails()
    after
      0 -> :ok
    end
  end
end
