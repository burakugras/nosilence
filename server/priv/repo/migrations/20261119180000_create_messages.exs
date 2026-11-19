# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateMessages do
  use Ecto.Migration

  def change do
    # Text channels have no capacity; voice channels must have one.
    alter table(:channels) do
      modify :capacity, :integer, null: true, from: {:integer, null: false}
    end

    create constraint(:channels, :channels_kind, check: "kind IN ('voice', 'text')")

    create constraint(:channels, :voice_channels_have_capacity,
             check: "kind <> 'voice' OR capacity IS NOT NULL"
           )

    # E2EE-ready envelope: `content` holds bytes. Today they are UTF-8 text
    # (`encryption = 'none'`); later they will be MLS ciphertext from `device_id`.
    create table(:messages, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :channel_id, references(:channels, type: :binary_id, on_delete: :delete_all),
        null: false

      add :author_id, references(:users, type: :binary_id, on_delete: :nilify_all)
      add :content, :binary, null: false
      add :encryption, :string, null: false, default: "none"
      add :device_id, :string
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end

    create index(:messages, [:channel_id, :inserted_at, :id])
    create constraint(:messages, :messages_encryption, check: "encryption IN ('none')")
  end
end
