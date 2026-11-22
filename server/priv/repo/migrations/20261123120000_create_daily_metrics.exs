# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CreateDailyMetrics do
  use Ecto.Migration

  def change do
    # Anonymous daily totals (ADR 0011): a name, a value range ("bucket") and a
    # count. No user, channel or community ids; deleted after 30 days.
    create table(:daily_metrics, primary_key: false) do
      add :day, :date, primary_key: true
      add :name, :string, primary_key: true
      add :bucket, :integer, primary_key: true
      add :count, :bigint, null: false, default: 0
    end
  end
end
