# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.LiveKitWebhookController do
  use NosilenceWeb, :controller

  alias Nosilence.Voice.Webhook

  def receive(conn, _params) do
    auth = conn |> get_req_header("authorization") |> List.first("")

    case Webhook.verify(auth, conn.private[:raw_body]) do
      {:ok, event} ->
        Webhook.handle(event)
        send_resp(conn, :ok, "")

      :error ->
        send_resp(conn, :unauthorized, "")
    end
  end
end
