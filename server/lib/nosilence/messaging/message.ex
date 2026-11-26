# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Messaging.Message do
  @moduledoc """
  A text message. `content` is an envelope of bytes: UTF-8 text while
  `encryption` is "none", MLS ciphertext once text E2EE arrives.
  """
  use Ecto.Schema

  @primary_key {:id, :binary_id, autogenerate: true}
  @foreign_key_type :binary_id

  schema "messages" do
    field :content, :binary
    field :encryption, :string, default: "none"
    field :device_id, :string
    # Order within the channel, assigned by the database (never by clock time).
    field :seq, :integer, read_after_writes: true
    # Set when the author edits the text; the previous text is not kept.
    field :edited_at, :utc_datetime_usec
    field :edit_count, :integer, default: 0
    # Ids picked by the author's app, and "everyone" or "here" (ADR 0017).
    field :mentions, {:array, :binary_id}, default: []
    field :mention_scope, :string
    belongs_to :channel, Nosilence.Communities.Channel
    belongs_to :author, Nosilence.Accounts.User
    timestamps(type: :utc_datetime_usec, updated_at: false)
  end
end
