# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts.User do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{}

  @min_password 12
  @max_password 256
  @max_name 32

  schema "users" do
    field :email, :string
    field :display_name, :string
    field :password, :string, virtual: true, redact: true
    field :hashed_password, :string, redact: true
    field :confirmed_at, :utc_datetime
    field :age_confirmed_at, :utc_datetime
    field :age_confirmed, :boolean, virtual: true
    field :google_sub, :string
    field :username, :string
    field :friend_requests_from, :string, default: "everyone"
    field :community_members_can_message, :boolean, default: true
    # Profile (ADR 0017): see Nosilence.Profiles.
    field :avatar_version, :integer
    field :status, :string, default: "online"
    field :status_text, :string
    field :status_expires_at, :utc_datetime

    timestamps(type: :utc_datetime)
  end

  def min_password_length, do: @min_password

  @doc "Changeset for sign-up with email and password."
  def registration_changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:email, :display_name, :password, :age_confirmed])
    |> validate_email(opts)
    |> validate_display_name()
    |> validate_password(opts)
    |> validate_age_confirmed()
  end

  @doc """
  Changeset for an account created through Google. The email is already verified
  by Google, so the account starts confirmed and has no password.
  """
  def google_registration_changeset(user, %{sub: sub, email: email}, attrs) do
    user
    |> cast(attrs, [:display_name, :age_confirmed])
    |> put_change(:email, email)
    |> put_change(:google_sub, sub)
    |> put_change(:confirmed_at, DateTime.utc_now(:second))
    |> validate_email(validate_unique: true)
    |> validate_display_name()
    |> validate_age_confirmed()
    |> unique_constraint(:google_sub)
  end

  @doc """
  Links Google to an existing account found by email. If that account was never
  confirmed, its password is removed: whoever set it never proved they own the
  email, and keeping it would let them into the Google user's account.
  """
  def link_google_changeset(%__MODULE__{} = user, sub) do
    changes =
      if user.confirmed_at,
        do: %{google_sub: sub},
        else: %{google_sub: sub, confirmed_at: DateTime.utc_now(:second), hashed_password: nil}

    user |> change(changes) |> unique_constraint(:google_sub)
  end

  # Usernames that would look official.
  @reserved ~w(admin administrator moderator mod nosilence support help system staff official
               root everyone here deleted)

  @doc """
  Choosing or changing the unique username (ADR 0015): 3-32 characters, lower
  case letters, digits, "_" and ".", not starting or ending with "." and
  without "..". Compared case-insensitively.
  """
  def username_changeset(user, attrs) do
    user
    |> cast(attrs, [:username])
    |> update_change(:username, &(&1 |> String.trim() |> String.downcase()))
    |> validate_required([:username])
    |> validate_length(:username, min: 3, max: 32)
    |> validate_format(:username, ~r/\A[a-z0-9_.]+\z/,
      message: "can only contain letters, digits, _ and ."
    )
    |> validate_format(:username, ~r/\A(?!\.)(?!.*\.\.)(?!.*\.\z)/,
      message: "cannot start or end with a dot or have two dots in a row"
    )
    |> validate_exclusion(:username, @reserved, message: "is reserved")
    |> unsafe_validate_unique(:username, Nosilence.Repo, message: "is taken")
    |> unique_constraint(:username, message: "is taken")
  end

  @doc "Who may send friend requests, and whether community members may message."
  def privacy_changeset(user, attrs) do
    user
    |> cast(attrs, [:friend_requests_from, :community_members_can_message])
    |> validate_inclusion(:friend_requests_from, ~w(everyone communities))
  end

  @doc "Changeset for setting a new password (password reset)."
  def password_changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:password])
    |> validate_password(opts)
  end

  def confirm_changeset(user) do
    change(user, confirmed_at: DateTime.utc_now(:second))
  end

  @doc """
  Checks a password against the stored hash in constant time. When there is no
  user, still runs a fake check so the response time does not reveal whether
  the email exists.
  """
  def valid_password?(%__MODULE__{hashed_password: hash}, password)
      when is_binary(hash) and is_binary(password) do
    Argon2.verify_pass(password, hash)
  end

  def valid_password?(_, _) do
    Argon2.no_user_verify()
    false
  end

  defp validate_email(changeset, opts) do
    changeset
    |> update_change(:email, &String.trim/1)
    |> validate_required([:email])
    |> validate_length(:email, max: 160)
    # One "@", no spaces, a dot in the domain. Real proof is the confirmation link.
    |> validate_format(:email, ~r/\A[^@\s]+@[^@\s]+\.[^@\s]+\z/, message: "must be a valid email")
    |> validate_change(:email, &check_domain_labels/2)
    |> maybe_validate_unique_email(opts)
  end

  # DNS labels are at most 63 characters. Rejecting longer ones early also keeps
  # oversized punycode labels away from the mail library.
  defp check_domain_labels(:email, email) do
    domain = email |> String.split("@") |> List.last()

    if domain |> String.split(".") |> Enum.all?(&(byte_size(&1) in 1..63)),
      do: [],
      else: [email: "must be a valid email"]
  end

  defp maybe_validate_unique_email(changeset, opts) do
    if Keyword.get(opts, :validate_unique, true) do
      changeset
      |> unsafe_validate_unique(:email, Nosilence.Repo)
      |> unique_constraint(:email)
    else
      changeset
    end
  end

  defp validate_display_name(changeset) do
    changeset
    |> update_change(:display_name, &String.trim/1)
    |> validate_required([:display_name])
    |> validate_length(:display_name, max: @max_name)
    |> validate_format(:display_name, ~r/\A[^\p{Cc}\p{Cf}]*\z/u,
      message: "has invalid characters"
    )
  end

  defp validate_password(changeset, opts) do
    changeset
    |> validate_required([:password])
    |> validate_length(:password, min: @min_password, max: @max_password)
    |> maybe_hash_password(opts)
  end

  defp maybe_hash_password(changeset, opts) do
    password = get_change(changeset, :password)

    if (Keyword.get(opts, :hash_password, true) and password) && changeset.valid? do
      changeset
      |> put_change(:hashed_password, Argon2.hash_pwd_salt(password))
      |> delete_change(:password)
    else
      changeset
    end
  end

  defp validate_age_confirmed(changeset) do
    if get_change(changeset, :age_confirmed) == true do
      put_change(changeset, :age_confirmed_at, DateTime.utc_now(:second))
    else
      add_error(changeset, :age_confirmed, "you must be 18 or older")
    end
  end
end
