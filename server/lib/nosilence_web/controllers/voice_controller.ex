# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.VoiceController do
  use NosilenceWeb, :controller

  alias Nosilence.Voice

  action_fallback NosilenceWeb.FallbackController

  @doc "Token for a channel's voice room. Members of the channel's community only."
  def token(conn, %{"channel_id" => channel_id}) do
    with {:ok, join} <- Voice.join_channel(conn.assigns.current_user, channel_id),
         do: json(conn, join)
  end
end
