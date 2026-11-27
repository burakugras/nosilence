# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Reactions do
  @moduledoc """
  Emoji reactions on messages (ADR 0017), for channel messages and conversation
  messages alike: each person can put each allowed emoji (`Nosilence.Emoji`) on a
  message once, and a message carries at most 20 different emoji. Access to the
  message is checked by the caller (`Nosilence.Messaging`, `Nosilence.Social`).
  """

  import Ecto.Query

  alias Nosilence.Repo

  defmodule ChannelReaction do
    @moduledoc false
    use Ecto.Schema
    @primary_key false
    @foreign_key_type :binary_id
    schema "message_reactions" do
      field :message_id, :binary_id, primary_key: true
      field :user_id, :binary_id, primary_key: true
      field :emoji, :string, primary_key: true
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end
  end

  defmodule ConversationReaction do
    @moduledoc false
    use Ecto.Schema
    @primary_key false
    @foreign_key_type :binary_id
    schema "conversation_message_reactions" do
      field :message_id, :binary_id, primary_key: true
      field :user_id, :binary_id, primary_key: true
      field :emoji, :string, primary_key: true
      timestamps(type: :utc_datetime_usec, updated_at: false)
    end
  end

  @max_kinds 20

  def max_kinds, do: @max_kinds

  defp schema(:channel), do: ChannelReaction
  defp schema(:conversation), do: ConversationReaction

  @doc """
  Adds (`true`) or removes (`false`) the user's `emoji` on a message.
  `{:ok, changed?}`, or `{:error, reason}`.
  """
  def set(kind, message_id, user_id, emoji, add?) do
    with :ok <- check_emoji(emoji),
         :ok <- allowed(user_id) do
      if add?,
        do: add(schema(kind), message_id, user_id, emoji),
        else: remove(schema(kind), message_id, user_id, emoji)
    end
  end

  defp add(schema, message_id, user_id, emoji) do
    Repo.transaction(fn ->
      # One writer per message at a time, so two new emoji cannot both pass the limit.
      Repo.query!("SELECT pg_advisory_xact_lock(hashtext($1))", ["reactions:" <> message_id])

      kinds =
        Repo.all(
          from r in schema, where: r.message_id == ^message_id, distinct: true, select: r.emoji
        )

      if emoji in kinds or length(kinds) < @max_kinds do
        {count, _} =
          Repo.insert_all(
            schema,
            [
              %{
                message_id: message_id,
                user_id: user_id,
                emoji: emoji,
                inserted_at: DateTime.utc_now()
              }
            ],
            on_conflict: :nothing
          )

        count == 1
      else
        Repo.rollback(:reaction_limit)
      end
    end)
  end

  defp remove(schema, message_id, user_id, emoji) do
    {count, _} =
      Repo.delete_all(
        from r in schema,
          where: r.message_id == ^message_id and r.user_id == ^user_id and r.emoji == ^emoji
      )

    {:ok, count == 1}
  end

  @doc """
  The reactions of some messages as `%{message_id => [%{emoji, count, me}]}`,
  each list in the order the emoji were first used; `me` is whether `viewer_id`
  is among them.
  """
  def summary(_kind, [], _viewer_id), do: %{}

  def summary(kind, message_ids, viewer_id) do
    from(r in schema(kind),
      where: r.message_id in ^message_ids,
      group_by: [r.message_id, r.emoji],
      order_by: [asc: min(r.inserted_at)],
      select:
        {r.message_id, r.emoji, count(),
         fragment("bool_or(? = ?)", r.user_id, type(^viewer_id, :binary_id))}
    )
    |> Repo.all()
    |> Enum.group_by(&elem(&1, 0), fn {_, emoji, count, me} ->
      %{emoji: emoji, count: count, me: me}
    end)
  end

  @max_names 20

  @doc "Names of the people who put `emoji` on a message (the first 20) and the total."
  def reactors(kind, message_id, emoji) do
    query =
      from r in schema(kind),
        join: u in Nosilence.Accounts.User,
        on: u.id == r.user_id,
        where: r.message_id == ^message_id and r.emoji == ^emoji

    %{
      names:
        Repo.all(
          from [r, u] in query, order_by: r.inserted_at, limit: @max_names, select: u.display_name
        ),
      total: Repo.aggregate(query, :count)
    }
  end

  @doc "The reactions the user added, for their data export."
  def by_user(kind, user_id) do
    Repo.all(
      from r in schema(kind),
        where: r.user_id == ^user_id,
        order_by: r.inserted_at,
        select: %{message_id: r.message_id, emoji: r.emoji, added_at: r.inserted_at}
    )
  end

  defp check_emoji(emoji),
    do: if(Nosilence.Emoji.allowed?(emoji), do: :ok, else: {:error, {:invalid, "emoji"}})

  defp allowed(user_id) do
    case Nosilence.RateLimit.hit(:reaction, user_id) do
      :ok -> :ok
      {:error, :rate_limited, ms} -> {:error, :rate_limited, :reaction, ms}
    end
  end
end
