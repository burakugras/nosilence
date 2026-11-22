# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Metrics do
  @moduledoc """
  Anonymous daily metrics (ADR 0011).

  Only totals per day are stored: how many voice joins, messages, sign-ins;
  and, for measured values (join time, round trip, packet loss), how many fell
  into each value range ("bucket"), enough to estimate a median and p95. No
  user, channel or community ids are stored, and rows are deleted after
  `retention_days` (30).
  """
  import Ecto.Query

  alias Nosilence.Repo

  # Upper bounds of the value ranges per kind of value; the last range is open.
  @ms [10, 20, 50, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10_000]
  @percent [0.5, 1, 2, 5, 10, 20, 50, 100]
  @seconds [10, 60, 300, 900, 1800, 3600, 7200]

  @bounds %{
    "call_join_ms" => @ms,
    "call_rtt_ms" => @ms,
    "call_loss_pct" => @percent,
    "call_concealed_pct" => @percent,
    "call_duration_s" => @seconds
  }

  @counters ~w(voice_joins messages sign_ins connections call_reports call_reconnects)

  @doc "Adds `n` to a daily counter."
  def count(name, n \\ 1) when name in @counters and is_integer(n) and n > 0,
    do: bump(name, 0, n)

  @doc "Records one measured value in its range."
  def observe(name, value) when is_map_key(@bounds, name) and is_number(value) do
    bounds = @bounds[name]
    bucket = Enum.find_index(bounds, &(value <= &1)) || length(bounds)
    bump(name, bucket, 1)
  end

  defp bump(name, bucket, n) do
    Repo.insert_all(
      "daily_metrics",
      [%{day: Date.utc_today(), name: name, bucket: bucket, count: n}],
      conflict_target: [:day, :name, :bucket],
      on_conflict: [inc: [count: n]],
      log: false
    )

    :ok
  end

  @doc """
  The last `days` days: counters as totals, measured values as count, median
  and p95 (each the upper bound of the range it falls into, so "at most").
  """
  def summary(days \\ 7) do
    since = Date.add(Date.utc_today(), -(days - 1))

    Repo.all(
      from m in "daily_metrics",
        where: m.day >= ^since,
        group_by: [m.name, m.bucket],
        select: {m.name, m.bucket, sum(m.count)}
    )
    |> Enum.group_by(&elem(&1, 0), fn {_, bucket, n} -> {bucket, Decimal.to_integer(n)} end)
    |> Map.new(fn {name, buckets} -> {name, describe(name, Enum.sort(buckets))} end)
  end

  defp describe(name, buckets) when is_map_key(@bounds, name) do
    total = buckets |> Enum.map(&elem(&1, 1)) |> Enum.sum()

    %{
      count: total,
      median: quantile(name, buckets, total, 0.5),
      p95: quantile(name, buckets, total, 0.95)
    }
  end

  defp describe(_name, buckets), do: %{count: buckets |> Enum.map(&elem(&1, 1)) |> Enum.sum()}

  defp quantile(name, buckets, total, q) do
    target = Float.ceil(total * q)

    {bucket, _} =
      Enum.reduce_while(buckets, {nil, 0}, fn {bucket, n}, {_, seen} ->
        if seen + n >= target, do: {:halt, {bucket, seen + n}}, else: {:cont, {bucket, seen + n}}
      end)

    Enum.at(@bounds[name], bucket, :above)
  end

  @doc "Deletes days older than the retention period. Returns how many rows."
  def delete_expired do
    cutoff = Date.add(Date.utc_today(), -retention_days())
    {count, _} = Repo.delete_all(from m in "daily_metrics", where: m.day < ^cutoff)
    count
  end

  defp retention_days, do: Application.get_env(:nosilence, __MODULE__, [])[:retention_days] || 30
end
