# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts do
  @moduledoc """
  Accounts context: sign-up, email confirmation, sessions and password reset.

  Other parts of the app use only the functions in this module.
  """

  import Ecto.Query, only: [where: 3, from: 2]

  alias Ecto.Multi
  alias Nosilence.Accounts.{User, UserNotifier, UserToken}
  alias Nosilence.Repo

  ## Sign-up and confirmation

  @doc """
  Creates an unconfirmed account and emails a confirmation link.
  The user cannot sign in until the email is confirmed.
  """
  def register_user(attrs) do
    with {:ok, user} <- %User{} |> User.registration_changeset(attrs) |> Repo.insert() do
      deliver_confirmation(user)
      {:ok, user}
    end
  end

  def change_registration(attrs \\ %{}),
    do: User.registration_changeset(%User{}, attrs, hash_password: false, validate_unique: false)

  @doc """
  Sends a new confirmation link if the account exists and is unconfirmed.
  Always returns `:ok`, so the answer does not reveal which emails are registered.
  """
  def resend_confirmation(email) when is_binary(email) do
    case get_user_by_email(email) do
      %User{confirmed_at: nil} = user -> deliver_confirmation(user)
      _ -> :ok
    end

    :ok
  end

  @doc "Confirms the email behind a confirmation token. Tokens work once."
  def confirm_user(token) when is_binary(token) do
    with {:ok, query} <- UserToken.verify_query(token, "confirm"),
         %User{} = user <- Repo.one(query),
         {:ok, %{user: user}} <-
           Multi.new()
           |> Multi.update(:user, User.confirm_changeset(user))
           |> Multi.delete_all(:tokens, UserToken.by_user_query(user, "confirm"))
           |> Repo.transaction() do
      {:ok, user}
    else
      _ -> {:error, :invalid_token}
    end
  end

  defp deliver_confirmation(user) do
    {token, row} = UserToken.build(user, "confirm", user.email)
    Repo.insert!(row)
    UserNotifier.deliver_confirmation(user, link("/confirm", token))
  end

  ## Sessions

  @doc """
  Checks email and password. Unconfirmed accounts cannot sign in.
  Takes the same time whether or not the email exists.
  """
  def authenticate(email, password) when is_binary(email) and is_binary(password) do
    user = get_user_by_email(email)

    cond do
      not User.valid_password?(user, password) -> {:error, :invalid_credentials}
      is_nil(user.confirmed_at) -> {:error, :unconfirmed}
      true -> {:ok, user}
    end
  end

  def authenticate(_, _), do: {:error, :invalid_credentials}

  @doc "Creates a session and returns the raw token for the client."
  def create_session(%User{} = user) do
    {token, row} = UserToken.build(user, "session")
    Repo.insert!(row)
    token
  end

  def get_user_by_session(token) when is_binary(token) do
    case UserToken.verify_query(token, "session") do
      {:ok, query} -> Repo.one(query)
      :error -> nil
    end
  end

  def get_user_by_session(_), do: nil

  ## Desktop app

  @doc """
  After Google sign-in in the system browser, a one-time code for the desktop
  app. It is bound to the app's PKCE `code_challenge`, so only the app that
  started the sign-in (and holds the verifier) can redeem it.
  """
  def create_desktop_handoff(%User{} = user, code_challenge) when is_binary(code_challenge) do
    {code, row} = UserToken.build(user, "desktop_handoff", code_challenge)
    Repo.insert!(row)
    code
  end

  @doc "Redeems a handoff code once: `{:ok, user, session_token}` or `:error`."
  def redeem_desktop_handoff(code, verifier) when is_binary(code) and is_binary(verifier) do
    with {:ok, query} <- UserToken.verify_query(code, "desktop_handoff"),
         {row, user} <- Repo.one(query),
         # Single use, whatever happens next.
         {1, _} <- Repo.delete_all(from t in UserToken, where: t.id == ^row.id),
         true <- Plug.Crypto.secure_compare(row.sent_to, pkce_challenge(verifier)) do
      {:ok, user, create_session(user)}
    else
      _ -> :error
    end
  end

  def redeem_desktop_handoff(_, _), do: :error

  defp pkce_challenge(verifier),
    do: :crypto.hash(:sha256, verifier) |> Base.url_encode64(padding: false)

  @doc "The user with this id, or nil."
  def get_user(id) do
    case Ecto.UUID.cast(id) do
      {:ok, id} -> Repo.get(User, id)
      :error -> nil
    end
  end

  def delete_session(token) when is_binary(token) do
    Repo.delete_all(UserToken.by_token_query(token, "session"))
    :ok
  end

  ## Google

  @doc """
  Signs in a verified Google identity:

    * `{:ok, user}` when an account has this Google id, or has the same email
      (the Google id is then linked to it);
    * `{:new, identity}` when there is no account yet; the user must still
      choose a display name and confirm being 18+ (`register_google_user/2`).
  """
  def sign_in_with_google(%{sub: sub, email: email} = identity) do
    cond do
      user = Repo.get_by(User, google_sub: sub) ->
        {:ok, user}

      user = get_user_by_email(email) ->
        user |> User.link_google_changeset(sub) |> Repo.update()

      true ->
        {:new, identity}
    end
  end

  def register_google_user(identity, attrs) do
    %User{}
    |> User.google_registration_changeset(
      identity,
      Map.take(attrs, ["display_name", "age_confirmed"])
    )
    |> Repo.insert()
  end

  ## Password reset

  @doc "Emails a reset link if the account exists. Always returns `:ok`."
  def request_password_reset(email) when is_binary(email) do
    with %User{} = user <- get_user_by_email(email) do
      {token, row} = UserToken.build(user, "reset_password", user.email)
      Repo.insert!(row)
      UserNotifier.deliver_password_reset(user, link("/reset-password", token))
    end

    :ok
  end

  @doc """
  Sets a new password from a reset token and signs the user out everywhere:
  all sessions and reset links are deleted. Resetting also proves the user
  controls the email, so an unconfirmed account becomes confirmed.
  """
  def reset_password(token, attrs) when is_binary(token) do
    with {:ok, query} <- UserToken.verify_query(token, "reset_password"),
         %User{} = user <- Repo.one(query) do
      changeset = user |> User.password_changeset(attrs) |> confirm_if_needed(user)

      Multi.new()
      |> Multi.update(:user, changeset)
      |> Multi.delete_all(:tokens, UserToken.by_user_query(user, ["session", "reset_password"]))
      |> Repo.transaction()
      |> case do
        {:ok, %{user: user}} -> {:ok, user}
        {:error, :user, changeset, _} -> {:error, changeset}
      end
    else
      _ -> {:error, :invalid_token}
    end
  end

  defp confirm_if_needed(changeset, %User{confirmed_at: nil}),
    do: Ecto.Changeset.put_change(changeset, :confirmed_at, DateTime.utc_now(:second))

  defp confirm_if_needed(changeset, _user), do: changeset

  ## Helpers

  def get_user_by_email(email) when is_binary(email) do
    Repo.get_by(User, email: String.trim(email))
  end

  def get_user_by_email(_), do: nil

  @doc false
  # Deletes expired tokens. Phase 7 schedules this with the other retention jobs.
  def delete_expired_tokens do
    cutoff = DateTime.add(DateTime.utc_now(), -UserToken.session_validity_days(), :day)
    {count, _} = UserToken |> where([t], t.inserted_at < ^cutoff) |> Repo.delete_all()
    count
  end

  defp link(path, token) do
    base = Application.fetch_env!(:nosilence, :app_url)
    "#{base}#{path}?token=#{token}"
  end
end
