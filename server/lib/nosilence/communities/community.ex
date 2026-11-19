# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Community do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "communities" do
    field :name, :string
    has_many :memberships, Nosilence.Communities.Membership
    has_many :channels, Nosilence.Communities.Channel
    timestamps(type: :utc_datetime)
  end

  def changeset(community, attrs) do
    community
    |> cast(attrs, [:name])
    |> Nosilence.Communities.Names.validate(:name, max: 50)
  end
end
