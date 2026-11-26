# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.ProfilesReactionsMentions do
  use Ecto.Migration

  def change do
    # Profile (ADR 0017). The picture lives in its own table so loading a user
    # never loads its bytes; `avatar_version` names the current one (nil: none).
    alter table(:users) do
      add :avatar_version, :integer
      add :status, :string, null: false, default: "online"
      add :status_text, :string
      add :status_expires_at, :utc_datetime
    end

    create table(:user_avatars, primary_key: false) do
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :image, :binary, null: false
      timestamps(type: :utc_datetime)
    end

    # Mentions: the ids the author's app chose, never parsed from the text by the
    # server, so they keep working once text is end-to-end encrypted.
    alter table(:messages) do
      add :mentions, {:array, :binary_id}, null: false, default: []
      add :mention_scope, :string
    end

    alter table(:conversation_messages) do
      add :mentions, {:array, :binary_id}, null: false, default: []
    end

    create table(:message_reactions, primary_key: false) do
      add :message_id, references(:messages, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :emoji, :string, primary_key: true
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:message_reactions, [:user_id])

    create table(:conversation_message_reactions, primary_key: false) do
      add :message_id,
          references(:conversation_messages, type: :binary_id, on_delete: :delete_all),
          primary_key: true

      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :emoji, :string, primary_key: true
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:conversation_message_reactions, [:user_id])
  end
end
