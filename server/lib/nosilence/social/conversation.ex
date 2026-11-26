# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social.Conversation do
  @moduledoc "A direct (two people) or group (up to ten) conversation."
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "conversations" do
    field :kind, :string
    field :name, :string
    field :direct_key, :string
    belongs_to :owner, Nosilence.Accounts.User
    has_many :members, Nosilence.Social.ConversationMember
    timestamps(type: :utc_datetime)
  end
end
