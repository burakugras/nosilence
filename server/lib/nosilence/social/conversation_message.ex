# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social.ConversationMessage do
  @moduledoc """
  A message in a conversation. Same envelope as channel messages
  (`Nosilence.Messaging.Message`): plain text today (`encryption: "none"`),
  ready for end-to-end encrypted text later (ADR 0015).
  """
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "conversation_messages" do
    field :content, :binary
    field :encryption, :string, default: "none"
    field :seq, :integer, read_after_writes: true
    field :edited_at, :utc_datetime_usec
    field :edit_count, :integer, default: 0
    belongs_to :conversation, Nosilence.Social.Conversation
    belongs_to :author, Nosilence.Accounts.User
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
