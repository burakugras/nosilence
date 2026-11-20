# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.AddSeqToMessages do
  use Ecto.Migration

  def change do
    # Order messages by a database sequence, not by time: two messages sent in the
    # same clock tick (coarse on some systems) would otherwise be ordered at random.
    alter table(:messages) do
      add :seq, :bigserial, null: false
    end

    create unique_index(:messages, [:channel_id, :seq])
  end
end
