# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateUsersAndTokens do
  use Ecto.Migration

  def change do
    # Case-insensitive text, so "Burak@x.com" and "burak@x.com" are the same email.
    execute "CREATE EXTENSION IF NOT EXISTS citext", ""

    create table(:users, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :email, :citext, null: false
      add :display_name, :string, null: false
      # Null for accounts that only sign in with Google (phase 2b).
      add :hashed_password, :string
      add :confirmed_at, :utc_datetime
      # We store that the user confirmed being 18+, not their birth date (data minimisation).
      add :age_confirmed_at, :utc_datetime, null: false

      timestamps(type: :utc_datetime)
    end

    create unique_index(:users, [:email])

    create table(:users_tokens, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      # SHA-256 of the token. The token itself is never stored, so a stolen
      # database does not contain usable sessions or links.
      add :token_hash, :binary, null: false
      add :context, :string, null: false
      # For email tokens: the address the link was sent to.
      add :sent_to, :citext

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:users_tokens, [:user_id])
    create unique_index(:users_tokens, [:context, :token_hash])
  end
end
