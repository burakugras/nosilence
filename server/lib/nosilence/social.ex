# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Social do
  @moduledoc """
  People outside communities (ADR 0015): usernames, friends, blocking, and
  direct and group conversations.

  - Friend requests go by username or from a shared community's member list.
    The receiver chooses who may send them: everyone, or only people in their
    communities. At most 20 an hour per sender.
  - A direct conversation is possible with friends, and with people in a
    shared community unless they turned that off. Group conversations hold up
    to ten people; members add their own friends.
  - Blocking ends the friendship, refuses requests and direct messages both
    ways, and is never revealed: the blocked person sees the same refusal as
    for an unknown user.
  - Conversation messages are not end-to-end encrypted yet (decision 3A).

  Changes reach the people involved on their own topic (`Events.to_user/3`).
  """

  import Ecto.Query

  alias Nosilence.Accounts.User
  alias Nosilence.Communities.Membership
  alias Nosilence.{Events, Messaging, Reactions, Repo}

  alias Nosilence.Social.{
    Block,
    Conversation,
    ConversationMember,
    ConversationMessage,
    Friendship
  }

  @max_group 10
  @unread_cap 100

  ## Username and privacy

  def set_username(%User{} = user, username) do
    user |> User.username_changeset(%{username: username}) |> Repo.update()
  end

  def update_privacy(%User{} = user, attrs) do
    user |> User.privacy_changeset(attrs) |> Repo.update()
  end

  ## Friends

  @doc """
  Sends a friend request to `target` (a username, or `{:id, user_id}` from a
  member list). If they had asked first, this accepts it. `{:ok, :requested |
  :accepted}` or `{:error, reason}`.
  """
  def request_friend(%User{} = user, target) do
    with %User{} = other <- find_user(target) || {:error, :cannot_request},
         true <- other.id != user.id || {:error, :cannot_request},
         # Blocked either way: the same answer as for an unknown user.
         false <- blocked_between?(user.id, other.id),
         :ok <- may_request(user, other),
         :ok <- request_allowed(user) do
      case friendship(user.id, other.id) do
        %Friendship{status: "accepted"} ->
          {:error, :already_friends}

        %Friendship{status: "pending", requested_by_id: id} = f when id == other.id ->
          accept_row(f)
          notify_friends([user.id, other.id])
          {:ok, :accepted}

        %Friendship{} ->
          {:ok, :requested}

        nil ->
          {low, high} = order(user.id, other.id)

          Repo.insert!(%Friendship{
            user_low_id: low,
            user_high_id: high,
            requested_by_id: user.id,
            status: "pending"
          })

          notify_friends([user.id, other.id])
          {:ok, :requested}
      end
    else
      true -> {:error, :cannot_request}
      {:error, _} = error -> error
    end
  end

  @doc "Accepts a request `other_id` sent to the user."
  def accept_friend(%User{} = user, other_id) do
    with {:ok, other_id} <- Ecto.UUID.cast(other_id),
         %Friendship{status: "pending", requested_by_id: ^other_id} = f <-
           friendship(user.id, other_id) do
      accept_row(f)
      notify_friends([user.id, other_id])
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Declines or cancels a request, or ends a friendship."
  def remove_friend(%User{} = user, other_id) do
    with {:ok, other_id} <- Ecto.UUID.cast(other_id),
         %Friendship{} = f <- friendship(user.id, other_id) do
      Repo.delete!(f)
      notify_friends([user.id, other_id])
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Friends, requests both ways and blocked people, for the friends page."
  def list_friends(%User{id: me}) do
    rows =
      Repo.all(
        from f in Friendship,
          join: u in User,
          on:
            u.id ==
              fragment(
                "CASE WHEN ? = ? THEN ? ELSE ? END",
                f.user_low_id,
                type(^me, Ecto.UUID),
                f.user_high_id,
                f.user_low_id
              ),
          where: f.user_low_id == ^me or f.user_high_id == ^me,
          order_by: [asc: u.display_name],
          select: {f.status, f.requested_by_id, u}
      )

    blocked =
      Repo.all(
        from b in Block,
          join: u in User,
          on: u.id == b.blocked_id,
          where: b.blocker_id == ^me,
          order_by: [asc: u.display_name],
          select: u
      )

    %{
      friends: for({"accepted", _, u} <- rows, do: person(u)),
      incoming: for({"pending", by, u} <- rows, by != me, do: person(u)),
      outgoing: for({"pending", ^me, u} <- rows, do: person(u)),
      blocked: Enum.map(blocked, &person/1)
    }
  end

  def friends?(a_id, b_id), do: match?(%Friendship{status: "accepted"}, friendship(a_id, b_id))

  @doc "Ids of the user's friends (accepted friendships)."
  def friend_ids(user_id) do
    Repo.all(
      from f in Friendship,
        where:
          f.status == "accepted" and (f.user_low_id == ^user_id or f.user_high_id == ^user_id),
        select:
          fragment(
            "CASE WHEN ? = ? THEN ? ELSE ? END",
            f.user_low_id,
            type(^user_id, Ecto.UUID),
            f.user_high_id,
            f.user_low_id
          )
    )
    |> Enum.map(&Ecto.UUID.cast!/1)
  end

  ## Blocking

  @doc "Blocks `other_id`: ends any friendship or request between them."
  def block(%User{} = user, other_id) do
    with {:ok, other_id} <- Ecto.UUID.cast(other_id),
         true <- other_id != user.id,
         %User{} <- Repo.get(User, other_id) do
      Repo.insert!(%Block{blocker_id: user.id, blocked_id: other_id},
        on_conflict: :nothing,
        conflict_target: [:blocker_id, :blocked_id]
      )

      if f = friendship(user.id, other_id), do: Repo.delete!(f)
      notify_friends([user.id, other_id])
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  def unblock(%User{} = user, other_id) do
    with {:ok, other_id} <- Ecto.UUID.cast(other_id) do
      Repo.delete_all(
        from b in Block, where: b.blocker_id == ^user.id and b.blocked_id == ^other_id
      )

      Events.to_user(user.id, "friends_changed", %{})
      :ok
    end
  end

  def blocked_between?(a_id, b_id) do
    Repo.exists?(
      from b in Block,
        where:
          (b.blocker_id == ^a_id and b.blocked_id == ^b_id) or
            (b.blocker_id == ^b_id and b.blocked_id == ^a_id)
    )
  end

  @doc "Ids of the people `user_id` blocked."
  def blocked_ids(user_id),
    do: Repo.all(from b in Block, where: b.blocker_id == ^user_id, select: b.blocked_id)

  @doc """
  Of `ids`, those who blocked `author_id`: their mention by that author is
  dropped without telling anyone (ADR 0019).
  """
  def blocking(ids, author_id) do
    Repo.all(
      from b in Block,
        where: b.blocked_id == ^author_id and b.blocker_id in ^ids,
        select: b.blocker_id
    )
  end

  ## Conversations

  @doc """
  The direct conversation with `other_id`, created on first use. Allowed with
  friends, and with people in a shared community who allow that.
  """
  def open_direct(%User{} = user, other_id) do
    with {:ok, other_id} <- Ecto.UUID.cast(other_id),
         %User{} = other <- Repo.get(User, other_id),
         true <- other.id != user.id,
         :ok <- may_message(user, other) do
      {low, high} = order(user.id, other.id)
      key = "#{low}:#{high}"

      conversation =
        Repo.get_by(Conversation, direct_key: key) ||
          create_conversation(%{kind: "direct", direct_key: key}, [user.id, other.id])

      {:ok, conversation}
    else
      {:error, _} = error -> error
      _ -> {:error, :cannot_message}
    end
  end

  @doc "A group conversation with some of the user's friends (up to ten people in all)."
  def create_group(%User{} = user, member_ids, name \\ nil) do
    with {:ok, ids} <- cast_ids(member_ids),
         ids <- Enum.uniq(ids) -- [user.id],
         true <- length(ids) in 2..(@max_group - 1) || {:error, {:invalid, "members"}},
         true <- Enum.all?(ids, &friends?(user.id, &1)) || {:error, {:invalid, "members"}},
         {:ok, name} <- group_name(name) do
      conversation =
        create_conversation(%{kind: "group", name: name, owner_id: user.id}, [user.id | ids])

      {:ok, conversation}
    end
  end

  @doc "Adds the user's friends to a group they are in."
  def add_members(%User{} = user, conversation_id, member_ids) do
    with {:ok, %Conversation{kind: "group"} = c} <- member_of(user, conversation_id),
         {:ok, ids} <- cast_ids(member_ids),
         current <- member_ids_of(c.id),
         new <- Enum.uniq(ids) -- current,
         true <- new != [] || {:error, {:invalid, "members"}},
         true <- length(current) + length(new) <= @max_group || {:error, {:invalid, "members"}},
         true <- Enum.all?(new, &friends?(user.id, &1)) || {:error, {:invalid, "members"}} do
      now = DateTime.utc_now(:second)

      Repo.insert_all(
        ConversationMember,
        Enum.map(new, &%{conversation_id: c.id, user_id: &1, inserted_at: now, updated_at: now})
      )

      conversation_changed(c.id, current ++ new)
      :ok
    else
      {:ok, %Conversation{}} -> {:error, :forbidden}
      {:error, _} = error -> error
    end
  end

  @doc """
  Leaves a group, or (its creator) removes someone. Direct conversations
  cannot be left: each side simply stops writing.
  """
  def remove_member(%User{} = user, conversation_id, member_id) do
    with {:ok, %Conversation{kind: "group"} = c} <- member_of(user, conversation_id),
         {:ok, member_id} <- Ecto.UUID.cast(member_id),
         true <- (member_id == user.id or c.owner_id == user.id) || {:error, :forbidden} do
      before = member_ids_of(c.id)

      Repo.delete_all(
        from m in ConversationMember,
          where: m.conversation_id == ^c.id and m.user_id == ^member_id
      )

      left = before -- [member_id]

      if left == [] do
        Repo.delete!(c)
      else
        conversation_changed(c.id, before)
      end

      :ok
    else
      {:ok, %Conversation{}} -> {:error, :forbidden}
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  def rename_group(%User{} = user, conversation_id, name) do
    with {:ok, %Conversation{kind: "group"} = c} <- member_of(user, conversation_id),
         {:ok, name} <- group_name(name) do
      c |> Ecto.Changeset.change(name: name) |> Repo.update!()
      conversation_changed(c.id, member_ids_of(c.id))
      :ok
    else
      {:ok, %Conversation{}} -> {:error, :forbidden}
      error -> error
    end
  end

  @doc """
  The user's conversations, most recent first, with the other members and how
  many messages from others they have not read (up to 100).
  """
  def list_conversations(%User{id: me}) do
    mine =
      Repo.all(
        from m in ConversationMember,
          join: c in assoc(m, :conversation),
          where: m.user_id == ^me,
          select: {c, m.last_read_seq}
      )

    ids = Enum.map(mine, fn {c, _} -> c.id end)
    members = members_by_conversation(ids)

    last =
      Map.new(
        Repo.all(
          from msg in ConversationMessage,
            where: msg.conversation_id in ^ids,
            group_by: msg.conversation_id,
            select: {msg.conversation_id, max(msg.inserted_at)}
        )
      )

    mine
    |> Enum.map(fn {c, read_seq} ->
      %{
        id: c.id,
        kind: c.kind,
        name: c.name,
        owner_id: c.owner_id,
        members: Map.get(members, c.id, []),
        last_message_at: last[c.id],
        unread: unread(c.id, me, read_seq),
        sort: last[c.id] || c.inserted_at
      }
    end)
    |> Enum.sort_by(& &1.sort, {:desc, DateTime})
    |> Enum.map(&Map.delete(&1, :sort))
  end

  ## Conversation messages

  def list_messages(%User{} = user, conversation_id, opts \\ %{}) do
    with {:ok, c} <- member_of(user, conversation_id),
         {:ok, query} <- page_query(c.id, Map.get(opts, "before")) do
      size = Application.fetch_env!(:nosilence, Nosilence.Messaging)[:page_size]

      rows =
        Repo.all(from m in query, order_by: [desc: m.seq], limit: ^(size + 1), preload: :author)

      messages = rows |> Enum.take(size) |> Enum.reverse()

      {:ok,
       %{
         messages: messages,
         has_more: length(rows) > size,
         read: read_position(c.id, user.id),
         reactions: Reactions.summary(:conversation, Enum.map(messages, & &1.id), user.id)
       }}
    end
  end

  @doc """
  Sends a message to a conversation. `mentions` holds `"mentions"`, user ids
  picked by the author's app (ADR 0017); people not in the conversation are dropped.
  """
  def send_message(%User{} = user, conversation_id, text, mentions \\ %{}) do
    with {:ok, c} <- member_of(user, conversation_id),
         :ok <- may_still_write(user, c),
         {:ok, text} <- Messaging.validate_text(text),
         {:ok, ids} <- conversation_mentions(c.id, user.id, mentions),
         :ok <- message_allowed(user) do
      message =
        Repo.insert!(
          %ConversationMessage{
            conversation_id: c.id,
            author_id: user.id,
            content: text,
            mentions: ids
          },
          log: false
        )
        |> Map.put(:author, user)

      tell_members(c.id, "dm_created", to_payload(message))
      Nosilence.Metrics.count("messages")
      advance_read(user.id, c.id, message)
      {:ok, message}
    end
  end

  def edit_message(%User{} = user, message_id, text, mentions \\ %{}) do
    with {:ok, id} <- Ecto.UUID.cast(message_id),
         %ConversationMessage{author_id: author} = m when author == user.id <-
           Repo.get(ConversationMessage, id),
         {:ok, _} <- member_of(user, m.conversation_id),
         {:ok, text} <- Messaging.validate_text(text),
         {:ok, ids} <- conversation_mentions(m.conversation_id, user.id, mentions),
         {1, [m]} <- count_edit(m.id, text, ids) do
      m = Map.put(m, :author, user)
      tell_members(m.conversation_id, "dm_updated", to_payload(m))
      {:ok, m}
    else
      %ConversationMessage{} -> {:error, :forbidden}
      {0, []} -> {:error, :edit_limit}
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  @doc "Deletes the user's own message."
  def delete_message(%User{} = user, message_id) do
    with {:ok, id} <- Ecto.UUID.cast(message_id),
         %ConversationMessage{author_id: author} = m when author == user.id <-
           Repo.get(ConversationMessage, id) do
      Repo.delete!(m)

      tell_members(m.conversation_id, "dm_deleted", %{
        id: m.id,
        conversation_id: m.conversation_id
      })

      :ok
    else
      %ConversationMessage{} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  def mark_read(%User{} = user, conversation_id, message_id) do
    with {:ok, c} <- member_of(user, conversation_id),
         {:ok, id} <- Ecto.UUID.cast(message_id),
         %ConversationMessage{} = m <-
           Repo.one(
             from m in ConversationMessage, where: m.id == ^id and m.conversation_id == ^c.id
           ) do
      advance_read(user.id, c.id, m)
      :ok
    else
      {:error, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  @doc """
  Adds (`add?` true) or removes the user's reaction on a conversation message
  and tells the members. Writing rules apply (a blocked direct conversation
  takes no reactions either).
  """
  def react(%User{} = user, message_id, emoji, add?) do
    with {:ok, id} <- Ecto.UUID.cast(message_id),
         %ConversationMessage{} = m <- Repo.get(ConversationMessage, id),
         {:ok, c} <- member_of(user, m.conversation_id),
         :ok <- may_still_write(user, c),
         {:ok, changed?} <- Reactions.set(:conversation, m.id, user.id, emoji, add?) do
      if changed? do
        tell_members(c.id, "dm_reaction_changed", %{
          message_id: m.id,
          conversation_id: c.id,
          emoji: emoji,
          user_id: user.id,
          added: add?
        })
      end

      :ok
    else
      {:error, _} = error -> error
      {:error, _, _, _} = error -> error
      _ -> {:error, :not_found}
    end
  end

  @doc "The client-facing shape of a conversation message (`reactions` as in `Messaging.to_payload/2`)."
  def to_payload(%ConversationMessage{} = m, reactions \\ nil) do
    %{
      id: m.id,
      seq: m.seq,
      conversation_id: m.conversation_id,
      text: m.content,
      edited_at: m.edited_at,
      edits_left: Messaging.max_edits() - m.edit_count,
      author: m.author && Messaging.author(m.author),
      mentions: m.mentions,
      reactions: reactions,
      inserted_at: m.inserted_at
    }
  end

  defp conversation_mentions(conversation_id, author_id, params) when is_map(params) do
    with {:ok, ids} <- Messaging.mention_ids(params["mentions"]) do
      members = member_ids_of(conversation_id)
      ids = Enum.filter(ids, &(&1 in members))
      blocking = blocking(ids, author_id)
      {:ok, Enum.reject(ids, &(&1 in blocking))}
    end
  end

  defp conversation_mentions(_conversation_id, _author_id, _params), do: {:ok, []}

  ## Account data (Nosilence.Privacy)

  @doc "Every conversation message the user wrote, for their data export."
  def messages_by(%User{id: user_id}) do
    Repo.all(
      from m in ConversationMessage,
        where: m.author_id == ^user_id,
        order_by: m.inserted_at,
        select: %{conversation_id: m.conversation_id, text: m.content, sent_at: m.inserted_at}
    )
  end

  def delete_messages_by(%User{id: user_id}) do
    {count, _} = Repo.delete_all(from m in ConversationMessage, where: m.author_id == ^user_id)
    count
  end

  ## Internals

  defp find_user({:id, id}) do
    case Ecto.UUID.cast(id) do
      {:ok, id} -> Repo.get(User, id)
      :error -> nil
    end
  end

  defp find_user(username) when is_binary(username) do
    name = username |> String.trim() |> String.trim_leading("@") |> String.downcase()
    if name != "", do: Repo.get_by(User, username: name)
  end

  defp find_user(_), do: nil

  # The receiver's choice: everyone, or only people in their communities.
  defp may_request(%User{} = user, %User{friend_requests_from: "communities"} = other) do
    if share_community?(user.id, other.id), do: :ok, else: {:error, :cannot_request}
  end

  defp may_request(_user, _other), do: :ok

  defp request_allowed(user) do
    case Nosilence.RateLimit.hit(:friend_request, user.id) do
      :ok -> :ok
      {:error, :rate_limited, _ms} -> {:error, :too_many_requests}
    end
  end

  defp may_message(%User{} = user, %User{} = other) do
    cond do
      blocked_between?(user.id, other.id) -> {:error, :cannot_message}
      friends?(user.id, other.id) -> :ok
      other.community_members_can_message and share_community?(user.id, other.id) -> :ok
      true -> {:error, :cannot_message}
    end
  end

  # A direct conversation stays only as long as messaging is allowed (blocked,
  # unfriended outside shared communities): the history stays readable.
  defp may_still_write(user, %Conversation{kind: "direct"} = c) do
    case member_ids_of(c.id) -- [user.id] do
      [other_id] -> may_message(user, Repo.get!(User, other_id))
      [] -> {:error, :cannot_message}
    end
  end

  defp may_still_write(_user, _group), do: :ok

  defp message_allowed(user) do
    case Nosilence.RateLimit.hit(:message, user.id) do
      :ok -> :ok
      {:error, :rate_limited, ms} -> {:error, :sending_too_fast, ms}
    end
  end

  def share_community?(a_id, b_id) do
    Repo.exists?(
      from m1 in Membership,
        join: m2 in Membership,
        on: m2.community_id == m1.community_id,
        where: m1.user_id == ^a_id and m2.user_id == ^b_id
    )
  end

  @doc "True if the user is in the conversation."
  def member?(%User{} = user, conversation_id),
    do: match?({:ok, _}, member_of(user, conversation_id))

  @doc "Who put `emoji` on a conversation message (as `Messaging.reactors/3`)."
  def reactors(%User{} = user, message_id, emoji) do
    with {:ok, id} <- Ecto.UUID.cast(message_id),
         %ConversationMessage{} = m <- Repo.get(ConversationMessage, id),
         {:ok, _} <- member_of(user, m.conversation_id) do
      {:ok, Reactions.reactors(:conversation, m.id, emoji)}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "True if the two people are in a conversation together."
  def share_conversation?(a_id, b_id) do
    Repo.exists?(
      from m1 in ConversationMember,
        join: m2 in ConversationMember,
        on: m2.conversation_id == m1.conversation_id,
        where: m1.user_id == ^a_id and m2.user_id == ^b_id
    )
  end

  defp friendship(a_id, b_id) do
    {low, high} = order(a_id, b_id)
    Repo.get_by(Friendship, user_low_id: low, user_high_id: high)
  end

  defp accept_row(f), do: f |> Ecto.Changeset.change(status: "accepted") |> Repo.update!()

  defp order(a, b) when a < b, do: {a, b}
  defp order(a, b), do: {b, a}

  defp notify_friends(user_ids),
    do: Enum.each(user_ids, &Events.to_user(&1, "friends_changed", %{}))

  defp person(%User{} = u),
    do: %{id: u.id, display_name: u.display_name, username: u.username, avatar: u.avatar_version}

  defp member_of(%User{id: me}, conversation_id) do
    with {:ok, id} <- Ecto.UUID.cast(conversation_id),
         %Conversation{} = c <-
           Repo.one(
             from c in Conversation,
               join: m in assoc(c, :members),
               where: c.id == ^id and m.user_id == ^me
           ) do
      {:ok, c}
    else
      _ -> {:error, :not_found}
    end
  end

  defp member_ids_of(conversation_id),
    do:
      Repo.all(
        from m in ConversationMember,
          where: m.conversation_id == ^conversation_id,
          select: m.user_id
      )

  defp members_by_conversation(ids) do
    Repo.all(
      from m in ConversationMember,
        join: u in assoc(m, :user),
        where: m.conversation_id in ^ids,
        order_by: [asc: u.display_name],
        select: {m.conversation_id, u}
    )
    |> Enum.group_by(&elem(&1, 0), &person(elem(&1, 1)))
  end

  defp create_conversation(attrs, member_ids) do
    {:ok, c} =
      Repo.transaction(fn ->
        c = Repo.insert!(struct(Conversation, attrs))
        now = DateTime.utc_now(:second)

        Repo.insert_all(
          ConversationMember,
          Enum.map(
            member_ids,
            &%{conversation_id: c.id, user_id: &1, inserted_at: now, updated_at: now}
          )
        )

        c
      end)

    conversation_changed(c.id, member_ids)
    c
  end

  # Everyone who was or is in it reloads the conversation list.
  defp conversation_changed(id, user_ids),
    do: Enum.each(user_ids, &Events.to_user(&1, "conversation_changed", %{id: id}))

  defp tell_members(conversation_id, event, payload),
    do: Enum.each(member_ids_of(conversation_id), &Events.to_user(&1, event, payload))

  defp group_name(nil), do: {:ok, nil}

  defp group_name(name) when is_binary(name) do
    case String.trim(name) do
      "" ->
        {:ok, nil}

      trimmed ->
        if String.length(trimmed) <= 50, do: {:ok, trimmed}, else: {:error, {:invalid, "name"}}
    end
  end

  defp group_name(_), do: {:error, {:invalid, "name"}}

  defp cast_ids(ids) when is_list(ids) do
    Enum.reduce_while(ids, {:ok, []}, fn id, {:ok, acc} ->
      case Ecto.UUID.cast(id) do
        {:ok, uuid} -> {:cont, {:ok, [uuid | acc]}}
        :error -> {:halt, {:error, {:invalid, "members"}}}
      end
    end)
    |> case do
      {:ok, list} -> {:ok, Enum.reverse(list)}
      error -> error
    end
  end

  defp cast_ids(_), do: {:error, {:invalid, "members"}}

  defp page_query(conversation_id, nil),
    do: {:ok, from(m in ConversationMessage, where: m.conversation_id == ^conversation_id)}

  defp page_query(conversation_id, before) do
    with {:ok, id} <- Ecto.UUID.cast(before),
         %ConversationMessage{seq: seq} <-
           Repo.one(
             from m in ConversationMessage,
               where: m.id == ^id and m.conversation_id == ^conversation_id
           ) do
      {:ok,
       from(m in ConversationMessage,
         where: m.conversation_id == ^conversation_id and m.seq < ^seq
       )}
    else
      _ -> {:error, {:invalid, "before"}}
    end
  end

  defp count_edit(id, text, mentions) do
    from(m in ConversationMessage,
      where: m.id == ^id and m.edit_count < ^Messaging.max_edits(),
      select: m
    )
    # `log: false`: the query log would print the new text.
    |> Repo.update_all(
      [
        set: [content: text, edited_at: DateTime.utc_now(), mentions: mentions],
        inc: [edit_count: 1]
      ],
      log: false
    )
  end

  defp advance_read(user_id, conversation_id, %ConversationMessage{id: id, seq: seq}) do
    Repo.update_all(
      from(m in ConversationMember,
        where:
          m.conversation_id == ^conversation_id and m.user_id == ^user_id and
            (is_nil(m.last_read_seq) or m.last_read_seq < ^seq)
      ),
      set: [last_read_message_id: id, last_read_seq: seq]
    )
  end

  defp read_position(conversation_id, user_id) do
    Repo.one(
      from m in ConversationMember,
        where:
          m.conversation_id == ^conversation_id and m.user_id == ^user_id and
            not is_nil(m.last_read_seq),
        select: %{message_id: m.last_read_message_id, seq: m.last_read_seq}
    )
  end

  defp unread(conversation_id, user_id, read_seq) do
    query =
      from m in ConversationMessage,
        where: m.conversation_id == ^conversation_id and m.author_id != ^user_id,
        limit: @unread_cap,
        select: m.id

    query = if read_seq, do: where(query, [m], m.seq > ^read_seq), else: query
    Repo.aggregate(subquery(query), :count)
  end
end
