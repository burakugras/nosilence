# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts.UserToken do
  @moduledoc """
  Random tokens for sessions and email links.

  The client gets the raw token; the database keeps only its SHA-256 hash.
  Anyone who reads the database therefore cannot sign in as a user or use a
  confirmation or reset link.
  """
  use Ecto.Schema
  import Ecto.Query

  alias Nosilence.Accounts.User

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @rand_size 32

  @session_validity_days 60
  @confirm_validity_days 7
  @reset_validity_hours 1
  # Desktop Google sign-in: the browser hands the app a code it must redeem at once.
  @handoff_validity_minutes 2

  schema "users_tokens" do
    field :token_hash, :binary
    field :context, :string
    field :sent_to, :string
    belongs_to :user, User

    timestamps(type: :utc_datetime, updated_at: false)
  end

  def session_validity_days, do: @session_validity_days

  @doc "Returns `{raw_token, %UserToken{}}` ready to insert."
  def build(%User{} = user, context, sent_to \\ nil)
      when context in ["session", "confirm", "reset_password", "desktop_handoff"] do
    raw = :crypto.strong_rand_bytes(@rand_size)

    {Base.url_encode64(raw, padding: false),
     %__MODULE__{token_hash: hash(raw), context: context, sent_to: sent_to, user_id: user.id}}
  end

  @doc """
  Query for the user behind a valid token, or `:error` if the token is malformed.
  Email tokens are only valid while the user's email is still the one they were sent to.
  """
  def verify_query(encoded, context) do
    with {:ok, raw} <- Base.url_decode64(encoded, padding: false),
         true <- byte_size(raw) == @rand_size do
      {:ok, build_query(hash(raw), context)}
    else
      _ -> :error
    end
  end

  defp build_query(hash, "session") do
    from t in by_hash_query(hash, "session"),
      join: u in assoc(t, :user),
      where: t.inserted_at > ago(@session_validity_days, "day"),
      select: u
  end

  defp build_query(hash, "confirm") do
    from t in by_hash_query(hash, "confirm"),
      join: u in assoc(t, :user),
      where: t.inserted_at > ago(@confirm_validity_days, "day") and t.sent_to == u.email,
      select: u
  end

  defp build_query(hash, "reset_password") do
    from t in by_hash_query(hash, "reset_password"),
      join: u in assoc(t, :user),
      where: t.inserted_at > ago(@reset_validity_hours, "hour") and t.sent_to == u.email,
      select: u
  end

  defp build_query(hash, "desktop_handoff") do
    # `sent_to` holds the app's PKCE code challenge (see Accounts.create_desktop_handoff/2).
    from t in by_hash_query(hash, "desktop_handoff"),
      join: u in assoc(t, :user),
      where: t.inserted_at > ago(@handoff_validity_minutes, "minute"),
      select: {t, u}
  end

  @doc "Query for one token row by raw encoded token."
  def by_token_query(encoded, context) do
    case Base.url_decode64(encoded, padding: false) do
      {:ok, raw} -> by_hash_query(hash(raw), context)
      :error -> from(t in __MODULE__, where: false)
    end
  end

  def by_user_query(%User{id: user_id}, contexts) do
    from t in __MODULE__, where: t.user_id == ^user_id and t.context in ^List.wrap(contexts)
  end

  defp by_hash_query(hash, context) do
    from t in __MODULE__, where: t.token_hash == ^hash and t.context == ^context
  end

  defp hash(raw), do: :crypto.hash(:sha256, raw)
end
