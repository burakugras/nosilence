# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.LiveKitWebhookTest do
  # Uses the shared Watchdog process and channel processes: not async.
  use NosilenceWeb.ConnCase, async: false

  import Nosilence.LiveKitStub

  alias Nosilence.Voice.Group
  @key "test-api-key"
  @secret "test-api-secret-that-is-at-least-32-bytes"

  # A webhook as LiveKit sends it: a JWT over the body's SHA-256.
  defp signed(body, opts \\ []) do
    b64 = &Base.url_encode64(&1, padding: false)
    hash = Keyword.get(opts, :sha256, :crypto.hash(:sha256, body) |> Base.encode64())

    claims = %{
      "iss" => Keyword.get(opts, :iss, @key),
      "exp" => System.system_time(:second) + 60,
      "sha256" => hash
    }

    input =
      b64.(Jason.encode!(%{"alg" => "HS256", "typ" => "JWT"})) <>
        "." <> b64.(Jason.encode!(claims))

    input <> "." <> b64.(:crypto.mac(:hmac, :sha256, Keyword.get(opts, :secret, @secret), input))
  end

  defp event(name, room, identity) do
    Jason.encode!(%{
      "event" => name,
      "room" => %{"name" => room},
      "participant" => %{"identity" => identity}
    })
  end

  defp post_webhook(body, token) do
    build_conn()
    |> put_req_header("content-type", "application/webhook+json")
    |> put_req_header("authorization", token)
    |> post("/api/livekit/webhook", body)
  end

  test "only correctly signed webhooks are accepted" do
    body = event("room_started", Ecto.UUID.generate(), "x")
    assert post_webhook(body, signed(body)).status == 200

    assert post_webhook(body, signed(body, secret: "wrong-secret-wrong-secret-wrong!!")).status ==
             401

    assert post_webhook(body, signed(body, iss: "someone-else")).status == 401
    # The signature covers the exact body.
    assert post_webhook(body, signed("{}")).status == 401
    assert post_webhook(body, "").status == 401
  end

  test "a LiveKit participant with no MLS session is removed after the grace period" do
    room_with([])
    # The Watchdog process calls LiveKit, so it may use this test's stub.
    Req.Test.allow(Nosilence.Voice.LiveKitAPI, self(), Process.whereis(Nosilence.Voice.Watchdog))
    room = Ecto.UUID.generate()
    body = event("participant_joined", room, "outsider")
    assert post_webhook(body, signed(body)).status == 200

    assert_receive {:livekit, "RemoveParticipant", %{"room" => ^room, "identity" => "outsider"},
                    _},
                   1_000
  end

  test "a participant who is in the MLS group stays" do
    room_with([])
    room = Ecto.UUID.generate()
    device = spawn(fn -> Process.sleep(:infinity) end)
    {:create, _} = Group.join(room, "member", device, "key package")

    body = event("participant_joined", room, "member")
    assert post_webhook(body, signed(body)).status == 200
    refute_receive {:livekit, "RemoveParticipant", _, _}, 300
    Process.exit(device, :kill)
  end
end
