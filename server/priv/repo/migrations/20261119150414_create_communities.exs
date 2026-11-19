# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateCommunities do
  use Ecto.Migration

  def change do
    create table(:communities, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :name, :string, null: false
      timestamps(type: :utc_datetime)
    end

    create table(:memberships, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :community_id, references(:communities, type: :binary_id, on_delete: :delete_all),
        null: false

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all), null: false
      add :role, :string, null: false
      timestamps(type: :utc_datetime)
    end

    create unique_index(:memberships, [:community_id, :user_id])
    create index(:memberships, [:user_id])
    # Exactly one owner per community.
    create unique_index(:memberships, [:community_id],
             where: "role = 'owner'",
             name: :memberships_one_owner
           )

    create table(:channels, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :community_id, references(:communities, type: :binary_id, on_delete: :delete_all),
        null: false

      add :name, :string, null: false
      add :kind, :string, null: false, default: "voice"
      # Maximum people in the voice room; validated against configuration.
      add :capacity, :integer, null: false
      timestamps(type: :utc_datetime)
    end

    create index(:channels, [:community_id])

    create table(:invites, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :community_id, references(:communities, type: :binary_id, on_delete: :delete_all),
        null: false

      add :created_by_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      # SHA-256 of the invite token; the token itself is only in the link.
      add :token_hash, :binary, null: false
      add :expires_at, :utc_datetime, null: false
      # Null means unlimited uses until expiry.
      add :max_uses, :integer
      add :uses, :integer, null: false, default: 0
      add :revoked_at, :utc_datetime
      timestamps(type: :utc_datetime, updated_at: false)
    end

    create unique_index(:invites, [:token_hash])
    create index(:invites, [:community_id])
  end
end
