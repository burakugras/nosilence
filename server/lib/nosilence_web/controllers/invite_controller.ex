# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.InviteController do
  @moduledoc """
  Invite links. Tokens travel in request bodies, not URL paths, so they never
  appear in request logs (body parameters named "token" are filtered).
  """
  use NosilenceWeb, :controller

  alias Nosilence.Communities

  action_fallback NosilenceWeb.FallbackController

  def create(conn, %{"id" => community_id} = params) do
    opts = Map.take(params, ["expires_in_hours", "max_uses"])

    with {:ok, token, invite} <-
           Communities.create_invite(conn.assigns.current_user, community_id, opts) do
      url = Application.fetch_env!(:nosilence, :app_url) <> "/invite?token=" <> token
      conn |> put_status(:created) |> json(%{invite: invite_json(invite), url: url})
    end
  end

  def index(conn, %{"id" => community_id}) do
    with {:ok, invites} <- Communities.list_invites(conn.assigns.current_user, community_id) do
      json(conn, %{invites: Enum.map(invites, &invite_json/1)})
    end
  end

  def revoke(conn, %{"invite_id" => invite_id}) do
    with :ok <- Communities.revoke_invite(conn.assigns.current_user, invite_id),
         do: send_resp(conn, :no_content, "")
  end

  def preview(conn, params) do
    with {:ok, %{community: c}} <- Communities.preview_invite(params["token"]) do
      json(conn, %{community: %{id: c.id, name: c.name}})
    end
  end

  def accept(conn, params) do
    with {:ok, c} <- Communities.accept_invite(conn.assigns.current_user, params["token"]) do
      json(conn, %{community: %{id: c.id, name: c.name}})
    end
  end

  defp invite_json(i),
    do: %{id: i.id, expires_at: i.expires_at, max_uses: i.max_uses, uses: i.uses}
end
