# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts.Google do
  @moduledoc """
  Sign in with Google (OpenID Connect, authorization code flow with PKCE).

  1. `authorize/0` returns the Google URL plus the secrets the browser must keep
     (state, nonce, PKCE verifier) for the round trip.
  2. Google sends the browser back with a `code`. `verify_callback/3` checks
     `state`, exchanges the code directly with Google's token endpoint and
     validates the ID token claims.

  The ID token arrives over a direct TLS connection to Google's token endpoint,
  so, as OpenID Connect Core 3.1.3.7 allows, we rely on TLS server validation
  for its origin and check the claims (issuer, audience, expiry, nonce) instead
  of fetching Google's signing keys.
  """

  @authorize_url "https://accounts.google.com/o/oauth2/v2/auth"
  @token_url "https://oauth2.googleapis.com/token"
  @issuers ["https://accounts.google.com", "accounts.google.com"]

  @type identity :: %{sub: String.t(), email: String.t(), name: String.t() | nil}

  def enabled?, do: config()[:client_id] not in [nil, ""]

  @doc "Google URL to redirect to, and the values to keep until the callback."
  def authorize do
    state = random()
    nonce = random()
    verifier = random()

    query =
      URI.encode_query(%{
        client_id: config()[:client_id],
        redirect_uri: redirect_uri(),
        response_type: "code",
        scope: "openid email profile",
        state: state,
        nonce: nonce,
        code_challenge: challenge(verifier),
        code_challenge_method: "S256",
        prompt: "select_account"
      })

    {"#{@authorize_url}?#{query}", %{state: state, nonce: nonce, verifier: verifier}}
  end

  @doc """
  Validates the callback against what `authorize/0` returned and returns the
  Google identity. Only accounts with an email verified by Google are accepted.
  """
  @spec verify_callback(map(), map(), keyword()) :: {:ok, identity()} | {:error, atom()}
  def verify_callback(params, kept, opts \\ [])

  def verify_callback(%{"state" => state, "code" => code}, %{state: kept_state} = kept, opts)
      when is_binary(state) and is_binary(code) do
    with true <- Plug.Crypto.secure_compare(state, kept_state) || {:error, :state_mismatch},
         {:ok, id_token} <- exchange(code, kept.verifier, opts),
         {:ok, claims} <- decode(id_token),
         :ok <- validate(claims, kept.nonce, Keyword.get(opts, :now, System.system_time(:second))) do
      {:ok, %{sub: claims["sub"], email: claims["email"], name: claims["name"]}}
    end
  end

  def verify_callback(%{"error" => _}, _kept, _opts), do: {:error, :denied}
  def verify_callback(_params, _kept, _opts), do: {:error, :invalid_callback}

  defp exchange(code, verifier, opts) do
    form = [
      code: code,
      client_id: config()[:client_id],
      client_secret: config()[:client_secret],
      redirect_uri: redirect_uri(),
      grant_type: "authorization_code",
      code_verifier: verifier
    ]

    request = Req.new([url: @token_url, form: form, retry: false] ++ req_options(opts))

    case Req.post(request) do
      {:ok, %{status: 200, body: %{"id_token" => id_token}}} -> {:ok, id_token}
      {:ok, _response} -> {:error, :token_exchange_failed}
      {:error, _exception} -> {:error, :google_unreachable}
    end
  end

  defp decode(id_token) do
    with [_header, payload, _signature] <- String.split(id_token, "."),
         {:ok, json} <- Base.url_decode64(payload, padding: false),
         {:ok, claims} <- Jason.decode(json) do
      {:ok, claims}
    else
      _ -> {:error, :invalid_id_token}
    end
  end

  defp validate(claims, nonce, now) do
    cond do
      claims["iss"] not in @issuers ->
        {:error, :invalid_id_token}

      claims["aud"] != config()[:client_id] ->
        {:error, :invalid_id_token}

      not is_integer(claims["exp"]) or claims["exp"] <= now ->
        {:error, :invalid_id_token}

      not is_binary(claims["nonce"]) or not Plug.Crypto.secure_compare(claims["nonce"], nonce) ->
        {:error, :invalid_id_token}

      not is_binary(claims["sub"]) ->
        {:error, :invalid_id_token}

      claims["email_verified"] != true or not is_binary(claims["email"]) ->
        {:error, :email_not_verified}

      true ->
        :ok
    end
  end

  def redirect_uri,
    do: Application.fetch_env!(:nosilence, :app_url) <> "/api/auth/google/callback"

  defp random, do: :crypto.strong_rand_bytes(32) |> Base.url_encode64(padding: false)

  defp challenge(verifier),
    do: :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)

  defp req_options(opts), do: Keyword.get(opts, :req_options, config()[:req_options] || [])

  defp config, do: Application.get_env(:nosilence, __MODULE__, [])
end
