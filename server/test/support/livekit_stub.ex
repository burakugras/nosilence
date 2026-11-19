# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.LiveKitStub do
  @moduledoc "Fakes LiveKit's RoomService for tests (Req.Test)."

  @doc """
  Answers CreateRoom, ListParticipants, RemoveParticipant and DeleteRoom. `identities` are the participants
  already in the room. Every request is sent to the test process as
  `{:livekit, method, body, authorization}`.
  """
  def room_with(identities) do
    test = self()

    Req.Test.stub(Nosilence.Voice.LiveKitAPI, fn conn ->
      {:ok, raw, conn} = Plug.Conn.read_body(conn)
      method = conn.request_path |> String.split("/") |> List.last()
      [auth] = Plug.Conn.get_req_header(conn, "authorization")
      send(test, {:livekit, method, Jason.decode!(raw), auth})

      case method do
        "CreateRoom" ->
          Req.Test.json(conn, %{"name" => "room"})

        "ListParticipants" ->
          Req.Test.json(conn, %{"participants" => Enum.map(identities, &%{"identity" => &1})})

        method when method in ["RemoveParticipant", "DeleteRoom"] ->
          Req.Test.json(conn, %{})
      end
    end)
  end

  def unavailable do
    Req.Test.stub(Nosilence.Voice.LiveKitAPI, &Req.Test.transport_error(&1, :econnrefused))
  end
end
