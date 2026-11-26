# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.Social do
  use Ecto.Migration

  def change do
    # Unique usernames (case-insensitive) and who may reach the user (ADR 0015).
    alter table(:users) do
      add :username, :citext
      add :friend_requests_from, :string, null: false, default: "everyone"
      add :community_members_can_message, :boolean, null: false, default: true
    end

    create unique_index(:users, [:username])

    create constraint(:users, :users_friend_requests_from,
             check: "friend_requests_from IN ('everyone', 'communities')"
           )

    # One row per pair of users, the smaller id first: a pending request or a
    # friendship.
    create table(:friendships, primary_key: false) do
      add :user_low_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :user_high_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :requested_by_id, references(:users, type: :binary_id, on_delete: :delete_all),
        null: false

      add :status, :string, null: false
      timestamps(type: :utc_datetime)
    end

    create index(:friendships, [:user_high_id])
    create constraint(:friendships, :friendships_order, check: "user_low_id < user_high_id")

    create constraint(:friendships, :friendships_status,
             check: "status IN ('pending', 'accepted')"
           )

    create table(:blocks, primary_key: false) do
      add :blocker_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :blocked_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      timestamps(type: :utc_datetime, updated_at: false)
    end

    create index(:blocks, [:blocked_id])

    # Direct (two people) and group (up to ten) conversations.
    create table(:conversations, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :kind, :string, null: false
      add :name, :string
      add :owner_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      # "<smaller id>:<larger id>" for direct conversations: one per pair.
      add :direct_key, :string
      timestamps(type: :utc_datetime)
    end

    create unique_index(:conversations, [:direct_key])
    create constraint(:conversations, :conversations_kind, check: "kind IN ('direct', 'group')")

    create table(:conversation_members, primary_key: false) do
      add :conversation_id,
          references(:conversations, type: :binary_id, on_delete: :delete_all),
          primary_key: true

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      # Read position, like channel_read_states (ADR 0010).
      add :last_read_message_id, :binary_id
      add :last_read_seq, :bigint
      timestamps(type: :utc_datetime)
    end

    create index(:conversation_members, [:user_id])

    # Same envelope as channel messages: plain text today ("none"), ready for
    # end-to-end encrypted text later.
    create table(:conversation_messages, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :conversation_id,
          references(:conversations, type: :binary_id, on_delete: :delete_all),
          null: false

      add :author_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :content, :binary, null: false
      add :encryption, :string, null: false, default: "none"
      add :seq, :bigserial, null: false
      add :edited_at, :utc_datetime_usec
      add :edit_count, :integer, null: false, default: 0
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create unique_index(:conversation_messages, [:conversation_id, :seq])
    create index(:conversation_messages, [:author_id])
  end
end
