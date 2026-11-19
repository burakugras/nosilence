# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.AddGoogleSubToUsers do
  use Ecto.Migration

  def change do
    alter table(:users) do
      # Google's stable account id ("sub" claim). Emails can change; this does not.
      add :google_sub, :string
    end

    create unique_index(:users, [:google_sub])
  end
end
