# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.CommunityController do
  use NosilenceWeb, :controller

  alias Nosilence.Communities
  alias NosilenceWeb.ChangesetJSON

  action_fallback NosilenceWeb.FallbackController

  def index(conn, _params) do
    communities = Communities.list_communities(conn.assigns.current_user)

    json(conn, %{
      communities:
        Enum.map(communities, &%{id: &1.community.id, name: &1.community.name, role: &1.role})
    })
  end

  def create(conn, params) do
    case Communities.create_community(conn.assigns.current_user, Map.take(params, ["name"])) do
      {:ok, community} ->
        conn
        |> put_status(:created)
        |> json(%{community: %{id: community.id, name: community.name}})

      {:error, changeset} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(changeset))
    end
  end

  def show(conn, %{"id" => id}) do
    with {:ok, %{community: c, channels: channels, membership: m}} <-
           Communities.get_community(conn.assigns.current_user, id) do
      json(conn, %{
        community: %{id: c.id, name: c.name, role: m.role},
        channels: Enum.map(channels, &channel_json/1)
      })
    end
  end

  def delete(conn, %{"id" => id}) do
    with :ok <- Communities.delete_community(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def members(conn, %{"id" => id}) do
    with {:ok, members} <- Communities.list_members(conn.assigns.current_user, id) do
      json(conn, %{members: members})
    end
  end

  def remove_member(conn, %{"id" => id, "user_id" => user_id}) do
    with :ok <- Communities.remove_member(conn.assigns.current_user, id, user_id),
         do: send_resp(conn, :no_content, "")
  end

  def leave(conn, %{"id" => id}) do
    with :ok <- Communities.leave_community(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def create_channel(conn, %{"id" => id} = params) do
    case Communities.create_channel(conn.assigns.current_user, id, params) do
      {:ok, channel} ->
        conn |> put_status(:created) |> json(%{channel: channel_json(channel)})

      {:error, %Ecto.Changeset{} = cs} ->
        conn |> put_status(:unprocessable_entity) |> json(ChangesetJSON.errors(cs))

      error ->
        error
    end
  end

  defp channel_json(ch), do: %{id: ch.id, name: ch.name, kind: ch.kind, capacity: ch.capacity}
end
