# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Repo.Migrations.CommunityManagement do
  use Ecto.Migration

  def change do
    # Roles: owner, moderator, member (ADR 0012).
    create constraint(:memberships, :memberships_role,
             check: "role IN ('owner', 'moderator', 'member')"
           )

    # Channels in the order the owner chose.
    alter table(:channels) do
      add :position, :integer, null: false, default: 0
    end

    # Edited messages show "(edited)"; the previous text is not kept. At most
    # three edits per message.
    alter table(:messages) do
      add :edited_at, :utc_datetime_usec
      add :edit_count, :integer, null: false, default: 0
    end

    # Handing a community over: up to three candidates, asked one after another.
    create table(:ownership_transfers, primary_key: false) do
      add :id, :binary_id, primary_key: true

      add :community_id, references(:communities, type: :binary_id, on_delete: :delete_all),
        null: false

      # Account ids in the owner's order; no foreign keys (a candidate may leave).
      add :candidates, {:array, :binary_id}, null: false
      add :current, :integer, null: false, default: 0
      # When the current candidate's offer runs out.
      add :deadline, :utc_datetime, null: false
      # "voluntary": the owner stays if nobody accepts.
      # "account_deleted": the owner is gone; the community is deleted if nobody accepts.
      add :kind, :string, null: false
      # "offered", then "accepted", "declined" (voluntary) or "deleting" (account_deleted).
      add :status, :string, null: false, default: "offered"
      add :delete_at, :utc_datetime
      timestamps(type: :utc_datetime)
    end

    # At most one open transfer per community.
    create unique_index(:ownership_transfers, [:community_id],
             where: "status IN ('offered', 'deleting')",
             name: :ownership_transfers_one_open
           )
  end
end
