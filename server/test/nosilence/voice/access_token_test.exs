# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Voice.AccessTokenTest do
  use ExUnit.Case, async: true

  alias Nosilence.Voice.AccessToken

  @secret "test-api-secret-that-is-at-least-32-bytes"

  defp sign(extra \\ []) do
    [
      api_key: "key",
      api_secret: @secret,
      identity: "user-1",
      name: "Burak",
      grant: %{room: "lobby"},
      ttl_seconds: 60,
      now: 1_000
    ]
    |> Keyword.merge(extra)
    |> AccessToken.sign()
  end

  defp decode_part(token, index) do
    token
    |> String.split(".")
    |> Enum.at(index)
    |> Base.url_decode64!(padding: false)
    |> Jason.decode!()
  end

  test "produces a three-part HS256 JWT" do
    token = sign()
    assert [_, _, _] = String.split(token, ".")
    assert decode_part(token, 0) == %{"alg" => "HS256", "typ" => "JWT"}
  end

  test "carries LiveKit claims for one room" do
    claims = token_claims()

    assert claims["iss"] == "key"
    assert claims["sub"] == "user-1"
    assert claims["name"] == "Burak"
    assert claims["nbf"] == 1_000
    assert claims["exp"] == 1_060

    assert claims["video"] == %{
             "room" => "lobby",
             "roomJoin" => true,
             "canPublish" => true,
             "canSubscribe" => true,
             "canPublishData" => true
           }
  end

  test "signature verifies with the right secret only" do
    token = sign()
    assert AccessToken.signature_valid?(token, @secret)
    refute AccessToken.signature_valid?(token, "another-secret-that-is-also-32-bytes!")
  end

  test "any change to the claims breaks the signature" do
    [header, _claims, signature] = String.split(sign(), ".")
    forged = Base.url_encode64(~s({"sub":"admin"}), padding: false)
    refute AccessToken.signature_valid?(Enum.join([header, forged, signature], "."), @secret)
  end

  test "omits the name claim when no name is given" do
    token = sign(name: nil)
    refute Map.has_key?(decode_part(token, 1), "name")
  end

  defp token_claims, do: decode_part(sign(), 1)
end
