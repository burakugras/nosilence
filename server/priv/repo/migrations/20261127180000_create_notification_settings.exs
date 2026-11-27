# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateNotificationSettings do
  use Ecto.Migration

  def change do
    # Per user: how a community, a channel or a conversation notifies (ADR 0018).
    # No row means the default (all messages, or the community's setting).
    create table(:notification_settings, primary_key: false) do
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :target_type, :string, primary_key: true
      add :target_id, :binary_id, primary_key: true
      add :level, :string, null: false
      # Until when the level applies; nil: until the user changes it.
      add :until, :utc_datetime
      timestamps(type: :utc_datetime)
    end

    create index(:notification_settings, [:target_type, :target_id])
  end
end
