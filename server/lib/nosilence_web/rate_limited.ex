# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.RateLimited do
  @moduledoc "Applies `Nosilence.RateLimit` rules in controllers and answers 429."
  import Plug.Conn
  import Phoenix.Controller, only: [json: 2]

  @doc "The client's IP address as a string (a key for per-IP limits)."
  def ip(conn), do: conn.remote_ip |> :inet.ntoa() |> to_string()

  @doc "`:ok` if every `{rule, key}` allows one more hit, or the 429 response."
  def check(conn, rules) do
    Enum.reduce_while(rules, :ok, fn {rule, key}, :ok ->
      case Nosilence.RateLimit.hit(rule, key) do
        :ok -> {:cont, :ok}
        {:error, :rate_limited, ms} -> {:halt, {:halted, too_many(conn, ms)}}
      end
    end)
  end

  def too_many(conn, retry_after_ms) do
    seconds = max(div(retry_after_ms + 999, 1000), 1)

    conn
    |> put_resp_header("retry-after", Integer.to_string(seconds))
    |> put_status(:too_many_requests)
    |> json(%{error: "too many attempts, try again in #{seconds} seconds"})
  end
end
