# SPDX-License-Identifier: AGPL-3.0-only
defmodule Mix.Tasks.Nosilence.Metrics do
  @shortdoc "Prints the anonymous daily metrics (default: last 7 days)"
  @moduledoc """
  Prints the anonymous metrics kept by `Nosilence.Metrics`.

      mix nosilence.metrics        # last 7 days
      mix nosilence.metrics 30     # last 30 days

  Measured values show "at most" figures: the upper bound of the range the
  median and the 95th percentile fall into.
  """
  use Mix.Task

  @requirements ["app.start"]

  @impl true
  def run(args) do
    days = with [d | _] <- args, {n, ""} <- Integer.parse(d), do: n, else: (_ -> 7)
    summary = Nosilence.Metrics.summary(days)
    Mix.shell().info("Nosilence metrics, last #{days} days")

    for {name, data} <- Enum.sort(summary) do
      line =
        case data do
          %{median: m, p95: p} -> "#{name}: #{data.count} reports, median <= #{m}, p95 <= #{p}"
          %{count: c} -> "#{name}: #{c}"
        end

      Mix.shell().info("  " <> line)
    end
  end
end
