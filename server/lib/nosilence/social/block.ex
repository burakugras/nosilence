# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social.Block do
  @moduledoc "`blocker` does not want to hear from `blocked`."
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "blocks" do
    belongs_to :blocker, Nosilence.Accounts.User, primary_key: true
    belongs_to :blocked, Nosilence.Accounts.User, primary_key: true
    timestamps(type: :utc_datetime, updated_at: false)
  end
end
