# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Channel do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "channels" do
    field :name, :string
    field :kind, :string, default: "voice"
    field :capacity, :integer
    belongs_to :community, Nosilence.Communities.Community
    timestamps(type: :utc_datetime)
  end

  def changeset(channel, attrs) do
    limits = Application.fetch_env!(:nosilence, Nosilence.Communities)

    channel
    |> cast(attrs, [:name, :capacity])
    |> Nosilence.Communities.Names.validate(:name, max: 32)
    |> then(fn cs ->
      if get_field(cs, :capacity),
        do: cs,
        else: put_change(cs, :capacity, limits[:default_channel_capacity])
    end)
    |> validate_number(:capacity,
      greater_than_or_equal_to: 2,
      less_than_or_equal_to: limits[:max_channel_capacity]
    )
  end
end
