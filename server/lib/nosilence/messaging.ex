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
  alias Nosilence.Messaging.Message
  alias Nosilence.Repo

  # Control characters (except tab and newline) and bidirectional overrides,
  # which can make text display differently from what was sent.
  @forbidden ~r/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}\x{202A}-\x{202E}\x{2066}-\x{2069}]/u

  @doc """
  One page of a text channel's history, oldest first. `"before"` (a message id)
  pages further back. Returns `%{messages: [...], has_more: boolean}`.
  """
  def list_messages(%User{} = user, channel_id, opts \\ %{}) do
    with {:ok, channel, _} <- text_channel(user, channel_id, :view),
         {:ok, query} <- page_query(channel.id, Map.get(opts, "before")) do
      size = limits()[:page_size]

      rows =
        Repo.all(
          from m in query,
            order_by: [desc: m.inserted_at, desc: m.id],
            limit: ^(size + 1),
            preload: :author
        )

      {:ok, %{messages: rows |> Enum.take(size) |> Enum.reverse(), has_more: length(rows) > size}}
    end
  end

  @doc "Sends a message to a text channel and announces it to the community."
  def send_message(%User{} = user, channel_id, text) do
    with {:ok, channel, _} <- text_channel(user, channel_id, :send_message),
         {:ok, text} <- validate_text(text),
         :ok <- Nosilence.RateLimit.hit(:message, user.id) do
      # `log: false`: the query log would print the content as a parameter.
      message =
        Repo.insert!(%Message{channel_id: channel.id, author_id: user.id, content: text},
          log: false
        )
        |> Map.put(:author, user)

      Events.broadcast(channel.community_id, "message_created", to_payload(message))
      {:ok, message}
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
         %Message{inserted_at: at} <-
           Repo.one(from m in Message, where: m.id == ^id and m.channel_id == ^channel_id) do
      {:ok,
       from(m in Message,
         where:
           m.channel_id == ^channel_id and
             (m.inserted_at < ^at or (m.inserted_at == ^at and m.id < ^id))
       )}
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
