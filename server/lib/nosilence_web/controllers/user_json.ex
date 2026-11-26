# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.UserJSON do
  @moduledoc "The signed-in user as the client sees it."

  def user(user) do
    %{
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      username: user.username,
      friend_requests_from: user.friend_requests_from,
      community_members_can_message: user.community_members_can_message
    }
  end
end
