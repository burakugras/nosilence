# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.DesktopCors do
  @moduledoc """
  Lets the desktop app (a WebView with its own origin, e.g. `http://tauri.localhost`)
  call the API. Only the configured desktop origins get CORS headers, and never
  with credentials: the app sends a bearer token, not cookies.
  """
  @behaviour Plug
  import Plug.Conn

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    case get_req_header(conn, "origin") do
      [origin] ->
        if origin in NosilenceWeb.UserAuth.desktop_origins(), do: allow(conn, origin), else: conn

      _ ->
        conn
    end
  end

  defp allow(conn, origin) do
    conn =
      conn
      |> put_resp_header("access-control-allow-origin", origin)
      |> put_resp_header("vary", "origin")

    if conn.method == "OPTIONS" do
      conn
      |> put_resp_header("access-control-allow-methods", "GET, POST, DELETE")
      |> put_resp_header("access-control-allow-headers", "authorization, content-type, accept")
      |> put_resp_header("access-control-max-age", "600")
      |> send_resp(:no_content, "")
      |> halt()
    else
      conn
    end
  end
end
