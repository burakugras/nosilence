# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.NotificationSettingsController do
  @moduledoc "Notification levels per community, channel and conversation (ADR 0018)."
  use NosilenceWeb, :controller

  alias Nosilence.NotificationSettings

  action_fallback NosilenceWeb.FallbackController

  def index(conn, _params),
    do: json(conn, %{settings: NotificationSettings.list(conn.assigns.current_user)})

  def update(conn, %{"type" => type, "id" => id} = params) do
    with :ok <-
           NotificationSettings.put(
             conn.assigns.current_user,
             type,
             id,
             Map.take(params, ["level", "until"])
           ),
         do: send_resp(conn, :no_content, "")
  end

  def delete(conn, %{"type" => type, "id" => id}) do
    with :ok <- NotificationSettings.clear(conn.assigns.current_user, type, id),
         do: send_resp(conn, :no_content, "")
  end
end
