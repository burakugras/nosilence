# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.SuccessionWorker do
  @moduledoc "Checks ownership offers and final notices every minute (ADR 0012)."
  use GenServer

  def start_link(_opts), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)

  @impl true
  def init(nil) do
    if config(:enabled, true), do: schedule()
    {:ok, nil}
  end

  @impl true
  def handle_info(:tick, state) do
    Nosilence.Communities.Succession.tick()
    schedule()
    {:noreply, state}
  end

  defp schedule, do: Process.send_after(self(), :tick, config(:interval_ms, 60_000))

  defp config(name, default),
    do: Application.get_env(:nosilence, __MODULE__, []) |> Keyword.get(name, default)
end
