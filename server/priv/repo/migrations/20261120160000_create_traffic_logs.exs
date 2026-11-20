# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateTrafficLogs do
  use Ecto.Migration

  def change do
    # Legally required traffic records (ADR 0009): who connected, when, and from
    # which IP address and port. Never content. The address is encrypted with a
    # key kept outside the database. No foreign key: records outlive deleted accounts.
    create table(:traffic_logs, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :user_id, :binary_id, null: false
      add :event, :string, null: false
      add :encrypted_address, :binary, null: false
      add :inserted_at, :utc_datetime, null: false
    end

    create index(:traffic_logs, [:inserted_at])
    create index(:traffic_logs, [:user_id])
  end
end
