# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Membership do
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  @type t :: %__MODULE__{}

  @roles ~w(owner member)

  schema "memberships" do
    field :role, :string
    belongs_to :community, Nosilence.Communities.Community
    belongs_to :user, Nosilence.Accounts.User
    timestamps(type: :utc_datetime)
  end

  def roles, do: @roles
end
