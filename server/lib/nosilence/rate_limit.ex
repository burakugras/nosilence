# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.RateLimit do
  @moduledoc """
  Fixed-window rate limits kept in memory (ETS), for one server (ADR 0009).

  A rule allows `limit` hits per `window_ms` for one key, e.g. sign-in attempts
  for one email address. Counters reset when the window ends, and are lost on
  restart, which only makes limits briefly more lenient. With several servers
  this moves to a shared store.

  Rules are configuration (`config :nosilence, Nosilence.RateLimit`):
  `rule_name: {limit, window_ms}`.
  """
  use GenServer

  @table __MODULE__
  @sweep_ms 60_000

  @doc """
  Counts one hit for `rule` and `key`. `:ok`, or `{:error, :rate_limited, retry_after_ms}`.
  """
  def hit(rule, key) do
    {limit, window} = rule!(rule)
    now = System.monotonic_time(:millisecond)
    # Integer.mod, not rem: the monotonic clock may be negative.
    window_start = now - Integer.mod(now, window)
    bucket = {rule, key, window_start}

    count = :ets.update_counter(@table, bucket, {2, 1}, {bucket, 0, window_start + window})

    if count <= limit,
      do: :ok,
      else: {:error, :rate_limited, window_start + window - now}
  end

  defp rule!(rule) do
    Application.fetch_env!(:nosilence, __MODULE__) |> Keyword.fetch!(rule)
  end

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    :ets.new(@table, [:named_table, :public, :set, write_concurrency: true])
    schedule_sweep()
    {:ok, nil}
  end

  @impl true
  def handle_info(:sweep, state) do
    # Drop windows that have ended.
    now = System.monotonic_time(:millisecond)
    :ets.select_delete(@table, [{{:_, :_, :"$1"}, [{:<, :"$1", now}], [true]}])
    schedule_sweep()
    {:noreply, state}
  end

  defp schedule_sweep, do: Process.send_after(self(), :sweep, @sweep_ms)
end
