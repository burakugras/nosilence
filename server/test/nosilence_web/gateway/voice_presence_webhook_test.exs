# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Gateway.VoicePresenceWebhookTest do
  use NosilenceWeb.ChannelCase, async: false

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures

  alias NosilenceWeb.Gateway.{Presence, Socket}

  test "leaving LiveKit without an MLS session clears voice presence" do
    owner = confirmed_user_fixture()
    %{community: c, channel: voice} = community_fixture(owner)

    {:ok, socket} =
      connect(Socket, %{}, connect_info: %{auth_token: Socket.sign_ticket(owner)})

    {:ok, _, socket} = subscribe_and_join(socket, "community:" <> c.id, %{})
    ref = push(socket, "voice_join", %{"channel_id" => voice.id})
    assert_reply ref, :ok
    owner_id = owner.id
    assert_broadcast "presence_diff", %{joins: %{^owner_id => %{metas: [%{voice_channel_id: _}]}}}

    Nosilence.Voice.Webhook.handle(%{
      "event" => "participant_left",
      "room" => %{"name" => voice.id},
      "participant" => %{"identity" => owner.id}
    })

    assert_broadcast "presence_diff", %{
      joins: %{^owner_id => %{metas: [%{voice_channel_id: nil}]}}
    }

    assert [%{voice_channel_id: nil}] = Presence.get_by_key(socket, owner.id)[:metas]
  end
end
