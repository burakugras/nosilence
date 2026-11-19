# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.GoogleStub do
  @moduledoc "Fakes Google's token endpoint for tests (Req.Test)."

  @client_id "test-client-id.apps.googleusercontent.com"

  def client_id, do: @client_id

  @doc "An ID token with valid claims; override any claim with `claims`."
  def id_token(claims) do
    claims =
      Map.merge(
        %{
          "iss" => "https://accounts.google.com",
          "aud" => @client_id,
          "sub" => "google-sub-1",
          "email" => "g.user@example.com",
          "email_verified" => true,
          "name" => "G User",
          "exp" => System.system_time(:second) + 300
        },
        claims
      )

    enc = &(&1 |> Jason.encode!() |> Base.url_encode64(padding: false))
    enc.(%{"alg" => "RS256"}) <> "." <> enc.(claims) <> ".signature"
  end

  @doc """
  Makes the token endpoint answer with an ID token for `claims` and records the
  form it received, so tests can check the PKCE verifier and client secret.
  """
  def respond_with(claims) do
    test = self()

    Req.Test.stub(Nosilence.Accounts.Google, fn conn ->
      {:ok, body, conn} = Plug.Conn.read_body(conn)
      send(test, {:token_request, URI.decode_query(body)})
      Req.Test.json(conn, %{"id_token" => id_token(claims), "access_token" => "unused"})
    end)
  end

  def respond_with_error(status) do
    Req.Test.stub(Nosilence.Accounts.Google, fn conn ->
      conn |> Plug.Conn.put_status(status) |> Req.Test.json(%{"error" => "invalid_grant"})
    end)
  end
end
