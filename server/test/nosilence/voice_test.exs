# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.VoiceTest do
  use ExUnit.Case, async: true

  alias Nosilence.Voice
  alias Nosilence.Accounts.User
  alias Nosilence.Voice.AccessToken

  @user %User{id: "6f1c3f5e-7a43-4c1b-9d3e-2b1f0e8a9c11", display_name: "Burak"}

  test "returns a signed token for the user's id and display name" do
    assert {:ok, join} = Voice.join_room("lobby", @user)

    assert join.url == "ws://livekit.test:7880"
    assert join.room == "lobby"
    assert join.identity == @user.id
    assert AccessToken.signature_valid?(join.token, "test-api-secret-that-is-at-least-32-bytes")

    claims =
      join.token
      |> String.split(".")
      |> Enum.at(1)
      |> Base.url_decode64!(padding: false)
      |> Jason.decode!()

    assert claims["name"] == "Burak"
    assert claims["sub"] == @user.id
    assert claims["video"]["room"] == "lobby"
  end

  describe "room validation" do
    for room <- ["", "Lobby", "-lobby", "lobby room", "lobby/../x", String.duplicate("a", 33)] do
      test "rejects #{inspect(room)}" do
        assert {:error, %{room: _}} = Voice.join_room(unquote(room), @user)
      end
    end

    test "rejects a missing room" do
      assert {:error, %{room: "is required"}} = Voice.join_room(nil, @user)
    end

    test "accepts lowercase letters, digits and dashes" do
      assert {:ok, _} = Voice.join_room("team-42", @user)
    end
  end
end
