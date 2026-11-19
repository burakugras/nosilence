# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.CommunitiesFixtures do
  @moduledoc "Test helpers for communities."

  alias Nosilence.Communities

  @doc "A community owned by `owner`, with its default voice (`channel`) and text channel."
  def community_fixture(owner, name \\ "Nosilence Fans") do
    {:ok, community} = Communities.create_community(owner, %{"name" => name})
    {:ok, %{channels: channels}} = Communities.get_community(owner, community.id)

    %{
      community: community,
      channel: Enum.find(channels, &(&1.kind == "voice")),
      text_channel: Enum.find(channels, &(&1.kind == "text"))
    }
  end

  @doc "Makes `user` a member through a real invite."
  def join_fixture(owner, community, user) do
    {:ok, token, _} = Communities.create_invite(owner, community.id)
    {:ok, _} = Communities.accept_invite(user, token)
    :ok
  end
end
