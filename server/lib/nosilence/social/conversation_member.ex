# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social.ConversationMember do
  @moduledoc "A member of a conversation and where they stopped reading."
  use Ecto.Schema

  @primary_key false
  @foreign_key_type :binary_id

  schema "conversation_members" do
    belongs_to :conversation, Nosilence.Social.Conversation, primary_key: true
    belongs_to :user, Nosilence.Accounts.User, primary_key: true
    field :last_read_message_id, :binary_id
    field :last_read_seq, :integer
    timestamps(type: :utc_datetime)
  end
end
