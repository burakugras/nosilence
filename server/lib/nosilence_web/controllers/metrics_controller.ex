# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.MetricsController do
  @moduledoc """
  Call quality summaries from clients (ADR 0011). Signed-in users only (so the
  numbers come from real calls), but nothing about who sent them is stored:
  each value only increments an anonymous daily range in `Nosilence.Metrics`.
  """
  use NosilenceWeb, :controller

  alias Nosilence.Metrics
  alias NosilenceWeb.RateLimited

  # Field => {metric, allowed range}
  @fields %{
    "join_ms" => {"call_join_ms", 0..120_000},
    "rtt_ms" => {"call_rtt_ms", 0..60_000},
    "loss_pct" => {"call_loss_pct", 0..100},
    "concealed_pct" => {"call_concealed_pct", 0..100},
    "duration_s" => {"call_duration_s", 0..86_400}
  }

  def report(conn, params) do
    with :ok <- RateLimited.check(conn, call_report: conn.assigns.current_user.id),
         {:ok, values} <- validate(params) do
      Metrics.count("call_reports")
      for {metric, value} <- values, do: Metrics.observe(metric, value)

      reconnects = params["reconnects"]

      if is_integer(reconnects) and reconnects in 1..100,
        do: Metrics.count("call_reconnects", reconnects)

      send_resp(conn, :no_content, "")
    else
      {:halted, conn} -> conn
      :error -> conn |> put_status(:unprocessable_entity) |> json(%{error: "invalid report"})
    end
  end

  defp validate(params) do
    Enum.reduce_while(@fields, {:ok, []}, fn {field, {metric, range}}, {:ok, acc} ->
      case params[field] do
        nil ->
          {:cont, {:ok, acc}}

        v when is_number(v) and v >= range.first and v <= range.last ->
          {:cont, {:ok, [{metric, v} | acc]}}

        _ ->
          {:halt, :error}
      end
    end)
  end
end
