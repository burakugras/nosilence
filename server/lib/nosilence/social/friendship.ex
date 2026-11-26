# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social.Friendship do
  @moduledoc "A friend request (`pending`) or a friendship (`accepted`) between two users."
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "friendships" do
    belongs_to :user_low, Nosilence.Accounts.User, primary_key: true
    belongs_to :user_high, Nosilence.Accounts.User, primary_key: true
    belongs_to :requested_by, Nosilence.Accounts.User
    field :status, :string
    timestamps(type: :utc_datetime)
  end
end
