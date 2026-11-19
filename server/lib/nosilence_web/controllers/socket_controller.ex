# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.SocketController do
  use NosilenceWeb, :controller

  @doc "A 60-second ticket for opening the real-time connection."
  def create(conn, _params) do
    json(conn, %{token: NosilenceWeb.Gateway.Socket.sign_ticket(conn.assigns.current_user)})
  end
end
