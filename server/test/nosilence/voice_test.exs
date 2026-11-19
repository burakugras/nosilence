# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.VoiceTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.LiveKitStub

  alias Nosilence.Voice
  alias Nosilence.Voice.AccessToken

  @secret "test-api-secret-that-is-at-least-32-bytes"

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Burak"})
    Map.merge(%{owner: owner}, community_fixture(owner))
  end

  defp claims(token),
    do:
      token
      |> String.split(".")
      |> Enum.at(1)
      |> Base.url_decode64!(padding: false)
      |> Jason.decode!()

  test "a member gets a token for the channel's own room", %{owner: owner, channel: ch} do
    room_with([])
    assert {:ok, join} = Voice.join_channel(owner, ch.id)

    assert join.room == ch.id
    assert join.identity == owner.id
    assert join.url == "ws://livekit.test:7880"
    assert AccessToken.signature_valid?(join.token, @secret)

    c = claims(join.token)
    assert c["sub"] == owner.id
    assert c["name"] == "Burak"
    assert c["video"]["room"] == ch.id
    assert c["video"]["roomJoin"] == true
    refute Map.has_key?(c["video"], "roomAdmin")
  end

  test "the LiveKit room gets the channel's capacity as its hard limit", %{
    owner: owner,
    channel: ch
  } do
    room_with([])
    {:ok, _} = Voice.join_channel(owner, ch.id)

    assert_received {:livekit, "CreateRoom", %{"name" => room, "max_participants" => 8},
                     "Bearer " <> admin}

    assert room == ch.id

    admin = claims(admin)
    assert admin["video"] == %{"room" => ch.id, "roomAdmin" => true, "roomCreate" => true}
    assert admin["exp"] - admin["nbf"] == 60
  end

  test "non-members are refused before LiveKit is asked", %{channel: ch} do
    room_with([])
    assert {:error, :not_found} = Voice.join_channel(confirmed_user_fixture(), ch.id)
    refute_received {:livekit, _, _, _}
  end

  test "the ninth person is refused when eight are in the room",
       %{owner: owner, community: c, channel: ch} do
    newcomer = confirmed_user_fixture()
    join_fixture(owner, c, newcomer)

    room_with(for i <- 1..8, do: "user-#{i}")
    assert {:error, :room_full} = Voice.join_channel(newcomer, ch.id)
  end

  test "seven in the room still lets one more in", %{owner: owner, channel: ch} do
    room_with(for i <- 1..7, do: "user-#{i}")
    assert {:ok, _} = Voice.join_channel(owner, ch.id)
  end

  test "rejoining does not count yourself twice", %{owner: owner, channel: ch} do
    room_with([owner.id | for(i <- 1..7, do: "user-#{i}")])
    assert {:ok, _} = Voice.join_channel(owner, ch.id)
  end

  test "smaller channels have smaller limits", %{owner: owner, community: c} do
    {:ok, small} =
      Nosilence.Communities.create_channel(owner, c.id, %{"name" => "Duo", "capacity" => 2})

    room_with(["a", "b"])
    assert {:error, :room_full} = Voice.join_channel(owner, small.id)
  end

  test "if LiveKit cannot be reached no token is issued", %{owner: owner, channel: ch} do
    unavailable()
    assert {:error, :voice_unavailable} = Voice.join_channel(owner, ch.id)
  end
end
