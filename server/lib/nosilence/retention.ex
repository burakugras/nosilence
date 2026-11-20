# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Retention do
  @moduledoc """
  Deletes data we no longer need, once at start-up and then every day
  (ADR 0009): expired sessions and email or sign-in codes, invites that ended
  more than `stale_invite_days` ago, and traffic records past their retention
  period. Each step is idempotent, so running it twice or late is harmless.
  """
  use GenServer
  require Logger

  @doc "Runs every clean-up step now. Returns how many rows each deleted."
  def run do
    counts = %{
      tokens: Nosilence.Accounts.delete_expired_tokens(),
      invites: Nosilence.Communities.delete_stale_invites(config(:stale_invite_days)),
      traffic_logs: Nosilence.TrafficLog.delete_expired()
    }

    Logger.info("retention clean-up: #{inspect(counts)}")
    counts
  end

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    if config(:enabled), do: send(self(), :run)
    {:ok, nil}
  end

  @impl true
  def handle_info(:run, state) do
    run()
    Process.send_after(self(), :run, config(:interval_ms))
    {:noreply, state}
  end

  defp config(name), do: Application.fetch_env!(:nosilence, __MODULE__) |> Keyword.fetch!(name)
end
