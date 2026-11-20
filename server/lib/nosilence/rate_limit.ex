# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.RateLimit do
  @moduledoc """
  Rate limits kept in memory, for one server (ADR 0009).

  A rule allows `limit` hits per key in any `window` milliseconds (a sliding
  window: the last `window` ms, not clock-aligned buckets, so bursts cannot
  double up at a boundary). A rule may also set a `penalty`: going over the
  limit then blocks the key for that long, and for `repeat_penalty` if it
  happens again within `repeat_window`. Without a penalty, the caller waits
  until the oldest hit leaves the window.

  Rules are configuration (`config :nosilence, Nosilence.RateLimit`), e.g.
  `message: [limit: 10, window: 10_000, penalty: 30_000, ...]`. State is lost
  on restart, which only makes limits briefly more lenient; several servers
  will need a shared store.
  """
  use GenServer

  @sweep_ms 60_000

  @doc "Counts one hit. `:ok`, or `{:error, :rate_limited, retry_after_ms}`."
  def hit(rule, key), do: GenServer.call(__MODULE__, {:hit, rule!(rule), {rule, key}})

  defp rule!(rule) do
    opts = Application.fetch_env!(:nosilence, __MODULE__) |> Keyword.fetch!(rule)

    %{
      limit: Keyword.fetch!(opts, :limit),
      window: Keyword.fetch!(opts, :window),
      penalty: Keyword.get(opts, :penalty),
      repeat_penalty: Keyword.get(opts, :repeat_penalty, Keyword.get(opts, :penalty)),
      repeat_window: Keyword.get(opts, :repeat_window, 0)
    }
  end

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    schedule_sweep()
    # key => %{hits: [ms, newest first], blocked_until: ms, strikes: [ms], keep_until: ms}
    {:ok, %{}}
  end

  @impl true
  def handle_call({:hit, rule, key}, _from, state) do
    now = System.monotonic_time(:millisecond)
    entry = Map.get(state, key, %{hits: [], blocked_until: now, strikes: []})
    {reply, entry} = decide(entry, rule, now)
    {:reply, reply, Map.put(state, key, keep_until(entry, rule))}
  end

  @impl true
  def handle_info(:sweep, state) do
    now = System.monotonic_time(:millisecond)
    schedule_sweep()
    {:noreply, Map.reject(state, fn {_, e} -> e.keep_until < now end)}
  end

  defp decide(%{blocked_until: until} = entry, _rule, now) when now < until,
    do: {{:error, :rate_limited, until - now}, entry}

  defp decide(entry, rule, now) do
    hits = Enum.filter(entry.hits, &(&1 > now - rule.window))

    cond do
      length(hits) < rule.limit ->
        {:ok, %{entry | hits: [now | hits]}}

      rule.penalty ->
        strikes = Enum.filter(entry.strikes, &(&1 > now - rule.repeat_window))
        penalty = if strikes == [], do: rule.penalty, else: rule.repeat_penalty

        {{:error, :rate_limited, penalty},
         %{entry | hits: [], blocked_until: now + penalty, strikes: [now | strikes]}}

      true ->
        # No penalty: wait until the oldest hit in the window expires.
        {{:error, :rate_limited, List.last(hits) + rule.window - now}, %{entry | hits: hits}}
    end
  end

  defp keep_until(entry, rule) do
    newest = fn
      [t | _] -> t
      [] -> 0
    end

    Map.put(
      entry,
      :keep_until,
      Enum.max([
        entry.blocked_until,
        newest.(entry.hits) + rule.window,
        newest.(entry.strikes) + rule.repeat_window
      ])
    )
  end

  defp schedule_sweep, do: Process.send_after(self(), :sweep, @sweep_ms)
end
