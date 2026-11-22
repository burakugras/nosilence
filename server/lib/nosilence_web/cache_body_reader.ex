# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.CacheBodyReader do
  @moduledoc """
  Keeps the raw request body for LiveKit webhooks: their signature covers the
  exact bytes, which are gone once Plug.Parsers has decoded the JSON.
  """

  @webhook_path "/api/livekit/webhook"

  def read_body(%Plug.Conn{request_path: @webhook_path} = conn, opts) do
    with {:ok, body, conn} <- Plug.Conn.read_body(conn, opts) do
      raw = (conn.private[:raw_body] || "") <> body
      {:ok, body, Plug.Conn.put_private(conn, :raw_body, raw)}
    end
  end

  def read_body(conn, opts), do: Plug.Conn.read_body(conn, opts)
end
