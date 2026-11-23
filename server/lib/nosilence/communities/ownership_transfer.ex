# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.OwnershipTransfer do
  @moduledoc "A community being handed over to one of up to three candidates (ADR 0012)."
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "ownership_transfers" do
    belongs_to :community, Nosilence.Communities.Community
    field :candidates, {:array, :binary_id}
    field :current, :integer, default: 0
    field :deadline, :utc_datetime
    field :kind, :string
    field :status, :string, default: "offered"
    field :delete_at, :utc_datetime
    timestamps(type: :utc_datetime)
  end
end
