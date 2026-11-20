# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.Socket do
  @moduledoc """
  The real-time connection (WebSocket). Clients connect with a 60-second
  ticket from `POST /api/socket-token`, sent in the WebSocket handshake header
  (not the URL, so it never lands in proxy logs). Another site cannot open a
  connection with the user's cookie, because it cannot obtain a ticket.
  """
  use Phoenix.Socket

  alias Nosilence.Accounts

  channel "community:*", NosilenceWeb.Gateway.CommunityChannel
  channel "voice:*", NosilenceWeb.Gateway.VoiceChannel

  @salt "gateway socket"
  @max_age 60

  @doc "A short-lived ticket for opening a connection as `user`."
  def sign_ticket(user), do: Phoenix.Token.sign(NosilenceWeb.Endpoint, @salt, user.id)

  @impl true
  def connect(_params, socket, %{auth_token: ticket} = info) when is_binary(ticket) do
    with {:ok, user_id} <- Phoenix.Token.verify(socket, @salt, ticket, max_age: @max_age),
         %Accounts.User{} = user <- Accounts.get_user(user_id) do
      # Legally required traffic record of the connection (ADR 0009).
      with %{address: ip, port: port} <- info[:peer_data],
           do: Nosilence.TrafficLog.record(user.id, "connect", {ip, port})

      {:ok, assign(socket, :user, user)}
    else
      _ -> :error
    end
  end

  def connect(_params, _socket, _connect_info), do: :error

  @doc "Lets the server close all of a user's connections (sign-out, password reset)."
  @impl true
  def id(socket), do: socket_id(socket.assigns.user.id)

  def socket_id(user_id), do: "user_socket:" <> user_id

  def disconnect_user(user_id),
    do: NosilenceWeb.Endpoint.broadcast(socket_id(user_id), "disconnect", %{})
end
