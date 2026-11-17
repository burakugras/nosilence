# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.DevVoiceControllerTest do
  use NosilenceWeb.ConnCase, async: true

  test "POST /api/dev/voice-token returns join details", %{conn: conn} do
    conn = post(conn, ~p"/api/dev/voice-token", %{room: "lobby", name: "Burak"})

    assert %{"token" => token, "url" => url, "room" => "lobby", "identity" => _} =
             json_response(conn, 200)

    assert is_binary(token)
    assert url == "ws://livekit.test:7880"
  end

  test "invalid input returns 422 with field errors", %{conn: conn} do
    conn = post(conn, ~p"/api/dev/voice-token", %{room: "Bad Room", name: ""})

    assert %{"errors" => %{"room" => _}} = json_response(conn, 422)
  end

  test "the response never includes the API secret", %{conn: conn} do
    conn = post(conn, ~p"/api/dev/voice-token", %{room: "lobby", name: "Burak"})
    refute response(conn, 200) =~ "test-api-secret"
  end
end
