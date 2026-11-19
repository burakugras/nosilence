# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Invite do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "invites" do
    field :token_hash, :binary, redact: true
    field :expires_at, :utc_datetime
    field :max_uses, :integer
    field :uses, :integer, default: 0
    field :revoked_at, :utc_datetime
    belongs_to :community, Nosilence.Communities.Community
    belongs_to :created_by, Nosilence.Accounts.User
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
