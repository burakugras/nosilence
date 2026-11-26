# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.SocialController do
  @moduledoc "Username, privacy choices, friends and blocking (ADR 0015)."
  use NosilenceWeb, :controller

  alias Nosilence.Social
  alias NosilenceWeb.UserJSON

  action_fallback NosilenceWeb.FallbackController

  def set_username(conn, params) do
    with {:ok, user} <- Social.set_username(conn.assigns.current_user, params["username"]),
         do: json(conn, %{user: UserJSON.user(user)})
  end

  def update_privacy(conn, params) do
    with {:ok, user} <-
           Social.update_privacy(
             conn.assigns.current_user,
             Map.take(params, ["friend_requests_from", "community_members_can_message"])
           ),
         do: json(conn, %{user: UserJSON.user(user)})
  end

  def friends(conn, _params), do: json(conn, Social.list_friends(conn.assigns.current_user))

  @doc "By username, or by user id from a member list."
  def request(conn, params) do
    target =
      case params do
        %{"user_id" => id} when is_binary(id) -> {:id, id}
        _ -> params["username"]
      end

    with {:ok, result} <- Social.request_friend(conn.assigns.current_user, target),
         do: json(conn, %{result: result})
  end

  def accept(conn, %{"user_id" => id}) do
    with :ok <- Social.accept_friend(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def remove(conn, %{"user_id" => id}) do
    with :ok <- Social.remove_friend(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def block(conn, %{"user_id" => id}) do
    with :ok <- Social.block(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def unblock(conn, %{"user_id" => id}) do
    with :ok <- Social.unblock(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end
end
