# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.MessagingLogTest do
  # Changes the global log level, so it must not run alongside other tests.
  use Nosilence.DataCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias Nosilence.Messaging

  require Logger

  test "message content never reaches the logs, even at debug level" do
    owner = confirmed_user_fixture()
    %{text_channel: ch} = community_fixture(owner)
    previous = Logger.level()
    Logger.configure(level: :debug)
    on_exit(fn -> Logger.configure(level: previous) end)

    log =
      ExUnit.CaptureLog.capture_log([level: :debug], fn ->
        {:ok, _} = Messaging.send_message(owner, ch.id, "very private words")
        {:ok, _} = Messaging.list_messages(owner, ch.id)
      end)

    refute log =~ "very private words"
  end
end
