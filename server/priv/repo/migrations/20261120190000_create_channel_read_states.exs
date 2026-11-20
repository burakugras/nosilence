# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateChannelReadStates do
  use Ecto.Migration

  def change do
    # Where each user stopped reading each text channel: one row, moved forward
    # only. No history of reads is kept. The message id has no foreign key (the
    # message may be deleted); its sequence number is copied so counts still work.
    create table(:channel_read_states, primary_key: false) do
      add :user_id, references(:users, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :channel_id, references(:channels, type: :binary_id, on_delete: :delete_all),
        primary_key: true

      add :last_read_message_id, :binary_id, null: false
      add :last_read_seq, :bigint, null: false
      timestamps(type: :utc_datetime_usec, inserted_at: false)
    end
  end
end
