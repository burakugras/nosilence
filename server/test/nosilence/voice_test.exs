# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.VoiceTest do
  use ExUnit.Case, async: true

  alias Nosilence.Voice
  alias Nosilence.Voice.AccessToken

  test "returns a signed token, the LiveKit URL and a fresh identity" do
    assert {:ok, join} = Voice.join_room("lobby", "  Burak  ")

    assert join.url == "ws://livekit.test:7880"
    assert join.room == "lobby"
    assert {:ok, _} = Ecto.UUID.cast(join.identity)
    assert AccessToken.signature_valid?(join.token, "test-api-secret-that-is-at-least-32-bytes")

    claims =
      join.token
      |> String.split(".")
      |> Enum.at(1)
      |> Base.url_decode64!(padding: false)
      |> Jason.decode!()

    assert claims["name"] == "Burak"
    assert claims["sub"] == join.identity
    assert claims["video"]["room"] == "lobby"
  end

  test "every join gets a different identity" do
    {:ok, a} = Voice.join_room("lobby", "A")
    {:ok, b} = Voice.join_room("lobby", "B")
    refute a.identity == b.identity
  end

  describe "room validation" do
    for room <- ["", "Lobby", "-lobby", "lobby room", "lobby/../x", String.duplicate("a", 33)] do
      test "rejects #{inspect(room)}" do
        assert {:error, %{room: _}} = Voice.join_room(unquote(room), "Burak")
      end
    end

    test "rejects a missing room" do
      assert {:error, %{room: "is required"}} = Voice.join_room(nil, "Burak")
    end

    test "accepts lowercase letters, digits and dashes" do
      assert {:ok, _} = Voice.join_room("team-42", "Burak")
    end
  end

  describe "name validation" do
    test "rejects blank names" do
      assert {:error, %{name: "is required"}} = Voice.join_room("lobby", "   ")
      assert {:error, %{name: "is required"}} = Voice.join_room("lobby", nil)
    end

    test "rejects names longer than 32 characters" do
      assert {:error, %{name: "is too long"}} =
               Voice.join_room("lobby", String.duplicate("ş", 33))
    end

    test "rejects control and invisible formatting characters" do
      assert {:error, %{name: _}} = Voice.join_room("lobby", "Bu\nrak")
      assert {:error, %{name: _}} = Voice.join_room("lobby", "Bu" <> <<0x202E::utf8>> <> "rak")
    end

    test "accepts non-ASCII letters" do
      assert {:ok, _} = Voice.join_room("lobby", "Çağrı Öztürk")
    end
  end
end
