# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Channel do
  use Ecto.Schema
  import Ecto.Changeset

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @kinds ~w(voice text)

  schema "channels" do
    field :name, :string
    field :kind, :string, default: "voice"
    # Voice channels only; nil for text channels.
    field :capacity, :integer
    # Order in the channel list, chosen by the owner.
    field :position, :integer, default: 0
    belongs_to :community, Nosilence.Communities.Community
    timestamps(type: :utc_datetime)
  end

  def changeset(channel, attrs) do
    channel
    |> cast(attrs, [:name, :kind, :capacity])
    |> validate_required([:kind])
    |> validate_inclusion(:kind, @kinds)
    |> Nosilence.Communities.Names.validate(:name, max: 32)
    |> validate_capacity()
  end

  defp validate_capacity(changeset) do
    if get_field(changeset, :kind) == "voice" do
      limits = Application.fetch_env!(:nosilence, Nosilence.Communities)

      changeset
      |> then(fn cs ->
        if get_field(cs, :capacity),
          do: cs,
          else: put_change(cs, :capacity, limits[:default_channel_capacity])
      end)
      |> validate_number(:capacity,
        greater_than_or_equal_to: 2,
        less_than_or_equal_to: limits[:max_channel_capacity]
      )
    else
      put_change(changeset, :capacity, nil)
    end
  end
end
