# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Messaging do
  @moduledoc """
  Messaging context: text messages in text channels.

  Access is checked through `Nosilence.Communities` on every call. Message
  content is never logged. New and deleted messages are announced to the
  community's members through `Nosilence.Events`.
  """

  import Ecto.Query
  import Ecto.Changeset

  alias Nosilence.Accounts.User
  alias Nosilence.Communities
  alias Nosilence.Communities.Policy
  alias Nosilence.Events
  alias Nosilence.Messaging.{Message, ReadState}
  alias Nosilence.Repo

  # Control characters (except tab and newline) and bidirectional overrides,
  # which can make text display differently from what was sent.
  @forbidden ~r/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u

  @doc """
  One page of a text channel's history, oldest first. `"before"` (a message id)
  pages further back. Returns `%{messages: [...], has_more: boolean, read: read}`
  where `read` is where the user stopped reading (or nil).
  """
  def list_messages(%User{} = user, channel_id, opts \\ %{}) do
    with {:ok, channel, _} <- text_channel(user, channel_id, :view),
         {:ok, query} <- page_query(channel.id, Map.get(opts, "before")) do
      size = limits()[:page_size]

      rows =
        Repo.all(
          from m in query,
            order_by: [desc: m.seq],
            limit: ^(size + 1),
            preload: :author
        )

      {:ok,
       %{
         messages: rows |> Enum.take(size) |> Enum.reverse(),
         has_more: length(rows) > size,
         read: read_state(user, channel.id)
       }}
    end
  end

  @doc "Sends a message to a text channel and announces it to the community."
  def send_message(%User{} = user, channel_id, text) do
    with {:ok, channel, _} <- text_channel(user, channel_id, :send_message),
         {:ok, text} <- validate_text(text),
         :ok <- message_allowed(user) do
      # `log: false`: the query log would print the content as a parameter.
      message =
        Repo.insert!(%Message{channel_id: channel.id, author_id: user.id, content: text},
          log: false
        )
        |> Map.put(:author, user)

      Events.broadcast(channel.community_id, "message_created", to_payload(message))
      # Writing in a channel means you have caught up with it.
      advance_read(user.id, channel.id, message)
      {:ok, message}
    end
  end

  ## Read state (ADR 0010)

  @doc """
  Moves the user's read position in a text channel forward to `message_id`
  (never backwards). `:ok`, or `{:error, :not_found}`.
  """
  def mark_read(%User{} = user, channel_id, message_id) do
    with {:ok, channel, _} <- text_channel(user, channel_id, :view),
         {:ok, id} <- Ecto.UUID.cast(message_id),
         %Message{} = message <-
           Repo.one(from m in Message, where: m.id == ^id and m.channel_id == ^channel.id) do
      advance_read(user.id, channel.id, message)
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  defp advance_read(user_id, channel_id, %Message{id: id, seq: seq}) do
    now = DateTime.utc_now()

    Repo.insert_all(
      ReadState,
      [
        %{
          user_id: user_id,
          channel_id: channel_id,
          last_read_message_id: id,
          last_read_seq: seq,
          updated_at: now
        }
      ],
      conflict_target: [:user_id, :channel_id],
      # Only forward: an older message never moves the position back.
      on_conflict:
        from(r in ReadState,
          where: r.last_read_seq < ^seq,
          update: [set: [last_read_message_id: ^id, last_read_seq: ^seq, updated_at: ^now]]
        )
    )
  end

  defp read_state(user, channel_id) do
    Repo.one(
      from r in ReadState,
        where: r.user_id == ^user.id and r.channel_id == ^channel_id,
        select: %{message_id: r.last_read_message_id, seq: r.last_read_seq}
    )
  end

  @unread_cap 100

  @doc """
  Unread messages from others per text channel, `%{channel_id => count}`,
  counted up to 100 (the client shows "99+"). Without a read position, every
  message from others counts.
  """
  def unread_counts(%User{id: user_id}, channel_ids) do
    Map.new(channel_ids, fn channel_id ->
      unread =
        from m in Message,
          left_join: r in ReadState,
          on: r.channel_id == m.channel_id and r.user_id == ^user_id,
          where:
            m.channel_id == ^channel_id and
              (is_nil(m.author_id) or m.author_id != ^user_id) and
              (is_nil(r.last_read_seq) or m.seq > r.last_read_seq),
          select: m.id,
          limit: @unread_cap

      {channel_id, Repo.aggregate(subquery(unread), :count)}
    end)
  end

  @doc "Read positions, for the user's data export."
  def read_states_of(%User{id: user_id}) do
    Repo.all(
      from r in ReadState,
        join: ch in assoc(r, :channel),
        join: c in assoc(ch, :community),
        where: r.user_id == ^user_id,
        select: %{
          community: c.name,
          channel: ch.name,
          read_up_to_message: r.last_read_message_id,
          updated_at: r.updated_at
        }
    )
  end

  defp message_allowed(user) do
    case Nosilence.RateLimit.hit(:message, user.id) do
      :ok -> :ok
      {:error, :rate_limited, ms} -> {:error, :sending_too_fast, ms}
    end
  end

  @doc "Deletes a message. Authors delete their own; the owner can delete any."
  def delete_message(%User{} = user, message_id) do
    with {:ok, _} <- Ecto.UUID.cast(message_id),
         %Message{} = message <- Repo.get(Message, message_id),
         {:ok, channel, membership} <- text_channel(user, message.channel_id, :view) do
      if message.author_id == user.id or Policy.can?(membership, :delete_any_message) do
        Repo.delete!(message)

        Events.broadcast(channel.community_id, "message_deleted", %{
          id: message.id,
          channel_id: channel.id
        })

        :ok
      else
        {:error, :forbidden}
      end
    else
      {:error, :forbidden} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  @doc "Every message the user wrote, for their data export."
  def messages_by(%User{id: user_id}) do
    Repo.all(
      from m in Message,
        join: ch in assoc(m, :channel),
        join: c in assoc(ch, :community),
        where: m.author_id == ^user_id,
        order_by: m.inserted_at,
        select: %{community: c.name, channel: ch.name, text: m.content, sent_at: m.inserted_at}
    )
  end

  @doc "Deletes every message the user wrote (account deletion, if they ask for it)."
  def delete_messages_by(%User{id: user_id}) do
    {count, _} = Repo.delete_all(from m in Message, where: m.author_id == ^user_id)
    count
  end

  @doc "The client-facing shape of a message, used by the API and the gateway."
  def to_payload(%Message{} = m) do
    %{
      id: m.id,
      seq: m.seq,
      channel_id: m.channel_id,
      # Only plain-text envelopes exist today; see `Message`.
      text: m.content,
      author: m.author && %{id: m.author.id, display_name: m.author.display_name},
      inserted_at: m.inserted_at
    }
  end

  defp text_channel(user, channel_id, action) do
    case Communities.authorize_channel(user, channel_id, action) do
      {:ok, %{kind: "text"} = channel, membership} -> {:ok, channel, membership}
      {:ok, _voice, _} -> {:error, :not_found}
      error -> error
    end
  end

  defp page_query(channel_id, nil),
    do: {:ok, from(m in Message, where: m.channel_id == ^channel_id)}

  defp page_query(channel_id, before) do
    with {:ok, id} <- Ecto.UUID.cast(before),
         %Message{seq: seq} <-
           Repo.one(from m in Message, where: m.id == ^id and m.channel_id == ^channel_id) do
      {:ok, from(m in Message, where: m.channel_id == ^channel_id and m.seq < ^seq)}
    else
      _ -> {:error, {:invalid, "before"}}
    end
  end

  defp validate_text(text) do
    max = limits()[:max_message_length]
    text = if is_binary(text), do: String.trim(text), else: text

    {%{}, %{text: :string}}
    |> cast(%{text: text}, [:text])
    |> validate_required([:text])
    |> validate_length(:text, max: max)
    |> validate_change(:text, fn :text, value ->
      if String.valid?(value) and not Regex.match?(@forbidden, value),
        do: [],
        else: [text: "contains characters that are not allowed"]
    end)
    |> apply_action(:insert)
    |> case do
      {:ok, %{text: text}} -> {:ok, text}
      error -> error
    end
  end

  defp limits, do: Application.fetch_env!(:nosilence, Nosilence.Messaging)
end
