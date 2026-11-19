# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts.GoogleTest do
  use ExUnit.Case, async: true

  import Nosilence.GoogleStub

  alias Nosilence.Accounts.Google

  defp start_flow do
    {url, kept} = Google.authorize()
    {URI.decode_query(URI.parse(url).query), kept}
  end

  defp callback(kept, overrides \\ %{}) do
    params = Map.merge(%{"state" => kept.state, "code" => "auth-code"}, overrides)
    Google.verify_callback(params, kept)
  end

  test "authorize/0 asks Google for an OpenID code with PKCE, state and nonce" do
    {query, kept} = start_flow()

    assert query["client_id"] == client_id()
    assert query["redirect_uri"] == "http://app.test/api/auth/google/callback"
    assert query["response_type"] == "code"
    assert query["scope"] == "openid email profile"
    assert query["state"] == kept.state
    assert query["nonce"] == kept.nonce
    assert query["code_challenge_method"] == "S256"

    expected = :crypto.hash(:sha256, kept.verifier) |> Base.url_encode64(padding: false)
    assert query["code_challenge"] == expected
    refute Map.has_key?(query, "client_secret")
  end

  test "every flow gets fresh secrets" do
    {_, a} = start_flow()
    {_, b} = start_flow()
    refute a.state == b.state or a.nonce == b.nonce or a.verifier == b.verifier
  end

  test "a valid callback returns the Google identity and sends the PKCE verifier" do
    {_, kept} = start_flow()
    respond_with(%{"nonce" => kept.nonce})

    assert {:ok, %{sub: "google-sub-1", email: "g.user@example.com", name: "G User"}} =
             callback(kept)

    assert_received {:token_request, form}
    assert form["code"] == "auth-code"
    assert form["code_verifier"] == kept.verifier
    assert form["client_secret"] == "test-client-secret"
    assert form["grant_type"] == "authorization_code"
  end

  test "rejects a callback whose state does not match (cross-site login)" do
    {_, kept} = start_flow()
    respond_with(%{"nonce" => kept.nonce})
    assert {:error, :state_mismatch} = callback(kept, %{"state" => "forged"})
    refute_received {:token_request, _}
  end

  describe "ID token checks" do
    setup do
      {_, kept} = start_flow()
      %{kept: kept}
    end

    test "wrong nonce (replayed token)", %{kept: kept} do
      respond_with(%{"nonce" => "other"})
      assert {:error, :invalid_id_token} = callback(kept)
    end

    test "token issued to another app", %{kept: kept} do
      respond_with(%{"nonce" => kept.nonce, "aud" => "someone-else.apps.googleusercontent.com"})
      assert {:error, :invalid_id_token} = callback(kept)
    end

    test "wrong issuer", %{kept: kept} do
      respond_with(%{"nonce" => kept.nonce, "iss" => "https://evil.example"})
      assert {:error, :invalid_id_token} = callback(kept)
    end

    test "expired token", %{kept: kept} do
      respond_with(%{"nonce" => kept.nonce, "exp" => System.system_time(:second) - 1})
      assert {:error, :invalid_id_token} = callback(kept)
    end

    test "email not verified by Google", %{kept: kept} do
      respond_with(%{"nonce" => kept.nonce, "email_verified" => false})
      assert {:error, :email_not_verified} = callback(kept)
    end
  end

  test "token endpoint errors and user denial" do
    {_, kept} = start_flow()
    respond_with_error(400)
    assert {:error, :token_exchange_failed} = callback(kept)
    assert {:error, :denied} = Google.verify_callback(%{"error" => "access_denied"}, kept)
    assert {:error, :invalid_callback} = Google.verify_callback(%{}, kept)
  end
end
