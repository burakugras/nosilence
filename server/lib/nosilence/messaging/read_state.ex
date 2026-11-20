# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Messaging.ReadState do
  @moduledoc "The last message a user has read in a text channel (ADR 0010)."
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "channel_read_states" do
    belongs_to :user, Nosilence.Accounts.User, primary_key: true
    belongs_to :channel, Nosilence.Communities.Channel, primary_key: true
    field :last_read_message_id, :binary_id
    field :last_read_seq, :integer
    timestamps(type: :utc_datetime_usec, inserted_at: false)
  end
end
