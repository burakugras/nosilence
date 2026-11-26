# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities do
  @moduledoc """
  Communities context: communities, members and roles, channels and invites.

  Every function that acts for a user checks membership and `Policy` first.
  Non-members get `{:error, :not_found}`, never `:forbidden`, so they cannot
  learn which communities or channels exist.
  """

  import Ecto.Query

  alias Ecto.Multi
  alias Nosilence.Accounts.User
  alias Nosilence.Communities.{Channel, Community, Invite, Membership, Policy}
  alias Nosilence.Events
  alias Nosilence.Repo

  @default_invite_hours 7 * 24
  @max_invite_hours 30 * 24

  ## Communities

  @doc "Creates a community owned by `user`, with one voice and one text channel."
  def create_community(%User{} = user, attrs) do
    Multi.new()
    |> Multi.insert(:community, Community.changeset(%Community{}, attrs))
    |> Multi.insert(:membership, fn %{community: c} ->
      %Membership{community_id: c.id, user_id: user.id, role: "owner"}
    end)
    |> Multi.insert(:channel, fn %{community: c} ->
      Channel.changeset(%Channel{community_id: c.id}, %{"name" => "General", "kind" => "voice"})
    end)
    |> Multi.insert(:text_channel, fn %{community: c} ->
      Channel.changeset(%Channel{community_id: c.id}, %{"name" => "general", "kind" => "text"})
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{community: community}} ->
        Events.memberships_changed(user.id)
        {:ok, community}

      {:error, :community, changeset, _} ->
        {:error, changeset}
    end
  end

  @doc "Communities the user belongs to, each with the user's role."
  def list_communities(%User{id: user_id}) do
    Repo.all(
      from c in Community,
        join: m in Membership,
        on: m.community_id == c.id and m.user_id == ^user_id,
        order_by: [asc: c.name],
        select: %{community: c, role: m.role}
    )
  end

  @doc "The community, its channels and the user's membership, for members only."
  def get_community(%User{} = user, community_id) do
    with {:ok, membership} <- authorize(user, community_id, :view) do
      community = Repo.get!(Community, community_id)

      channels =
        Repo.all(
          from ch in Channel,
            where: ch.community_id == ^community.id,
            order_by: [ch.position, ch.inserted_at, ch.name]
        )

      {:ok, %{community: community, channels: channels, membership: membership}}
    end
  end

  @doc """
  Deletes the community for everyone. Returns the ids of its voice channels
  (their LiveKit rooms) so callers can close them.
  """
  def delete_community(%User{} = user, community_id) do
    with {:ok, membership} <- authorize(user, community_id, :delete_community) do
      rooms = voice_rooms(membership.community_id)
      Repo.delete_all(from c in Community, where: c.id == ^membership.community_id)
      Events.broadcast(membership.community_id, "community_deleted", %{})
      {:ok, %{voice_rooms: rooms}}
    end
  end

  ## Members

  def list_members(%User{} = user, community_id) do
    with {:ok, _} <- authorize(user, community_id, :view) do
      {:ok,
       Repo.all(
         from m in Membership,
           join: u in assoc(m, :user),
           where: m.community_id == ^community_id,
           order_by: [desc: m.role == "owner", desc: m.role == "moderator", asc: u.display_name],
           select: %{
             user_id: u.id,
             display_name: u.display_name,
             username: u.username,
             role: m.role
           }
       )}
    end
  end

  @doc """
  Removes a member (not the owner). Their live connections are closed through a
  `member_removed` event; the voice room ids are returned so callers can also
  remove them from voice.
  """
  def remove_member(%User{} = actor, community_id, member_user_id) do
    with {:ok, target} <- act_on(actor, community_id, member_user_id, :remove_member) do
      Repo.delete!(target)
      Events.broadcast(target.community_id, "member_removed", %{user_id: target.user_id})
      {:ok, %{voice_rooms: voice_rooms(target.community_id)}}
    end
  end

  @doc """
  The target's membership if `actor` may perform `action` on them: the action
  is allowed for the actor's role and the actor ranks above the target.
  """
  def act_on(%User{} = actor, community_id, target_user_id, action) do
    with {:ok, membership} <- authorize(actor, community_id, action),
         {:ok, target_id} <- Ecto.UUID.cast(target_user_id),
         %Membership{} = target <-
           Repo.get_by(Membership, community_id: membership.community_id, user_id: target_id) do
      if Policy.outranks?(membership, target.role), do: {:ok, target}, else: {:error, :forbidden}
    else
      :error -> {:error, :not_found}
      nil -> {:error, :not_found}
      error -> error
    end
  end

  @doc "Makes a member a moderator or a moderator a member. Owner only."
  def set_role(%User{} = owner, community_id, user_id, role)
      when role in ["moderator", "member"] do
    with {:ok, target} <- act_on(owner, community_id, user_id, :manage_roles) do
      target |> Ecto.Changeset.change(role: role) |> Repo.update!()

      Events.broadcast(target.community_id, "member_updated", %{
        user_id: target.user_id,
        role: role
      })

      :ok
    end
  end

  def set_role(_owner, _community_id, _user_id, _role), do: {:error, {:invalid, "role"}}

  @doc "Leaves a community. The owner cannot leave; they delete the community instead."
  def leave_community(%User{} = user, community_id) do
    with {:ok, membership} <- authorize(user, community_id, :leave) do
      Repo.delete!(membership)
      Events.broadcast(membership.community_id, "member_removed", %{user_id: user.id})
      :ok
    end
  end

  ## Channels

  def create_channel(%User{} = user, community_id, attrs) do
    with {:ok, membership} <- authorize(user, community_id, :create_channel) do
      last =
        Repo.one(
          from ch in Channel,
            where: ch.community_id == ^membership.community_id,
            select: max(ch.position)
        ) || 0

      %Channel{community_id: membership.community_id, position: last + 1}
      |> Channel.changeset(Map.take(attrs, ["name", "kind", "capacity"]))
      |> Repo.insert()
      |> tap(fn
        {:ok, ch} ->
          Events.broadcast(ch.community_id, "channel_created", %{
            id: ch.id,
            name: ch.name,
            kind: ch.kind,
            capacity: ch.capacity
          })

        _ ->
          :ok
      end)
    end
  end

  @doc "Renames a channel. Owner only."
  def rename_channel(%User{} = user, channel_id, name) do
    with {:ok, channel, _} <- authorize_channel(user, channel_id, :manage_channels) do
      channel
      |> Ecto.Changeset.cast(%{"name" => name}, [:name])
      |> Nosilence.Communities.Names.validate(:name, max: 32)
      |> Repo.update()
      |> tap(fn
        {:ok, ch} -> Events.broadcast(ch.community_id, "channels_changed", %{})
        _ -> :ok
      end)
    end
  end

  @doc "Deletes a channel and everything in it. Owner only. Returns the channel."
  def delete_channel(%User{} = user, channel_id) do
    with {:ok, channel, _} <- authorize_channel(user, channel_id, :manage_channels) do
      Repo.delete!(channel)
      Events.broadcast(channel.community_id, "channels_changed", %{})
      {:ok, channel}
    end
  end

  @doc "Puts the community's channels in the given order (a list of all their ids). Owner only."
  def reorder_channels(%User{} = user, community_id, ids) when is_list(ids) do
    with {:ok, membership} <- authorize(user, community_id, :manage_channels) do
      cid = membership.community_id
      current = Repo.all(from ch in Channel, where: ch.community_id == ^cid, select: ch.id)

      if Enum.sort(current) == Enum.sort(ids) do
        Repo.transaction(fn ->
          ids
          |> Enum.with_index(1)
          |> Enum.each(fn {id, pos} ->
            Repo.update_all(from(ch in Channel, where: ch.id == ^id), set: [position: pos])
          end)
        end)

        Events.broadcast(cid, "channels_changed", %{})
        :ok
      else
        {:error, {:invalid, "ids"}}
      end
    end
  end

  def reorder_channels(_user, _community_id, _ids), do: {:error, {:invalid, "ids"}}

  @doc "The community a channel belongs to (for server-side events, no user check)."
  def community_of_channel(channel_id) do
    with {:ok, id} <- Ecto.UUID.cast(channel_id),
         community_id when is_binary(community_id) <-
           Repo.one(from ch in Channel, where: ch.id == ^id, select: ch.community_id) do
      {:ok, community_id}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "A voice channel the user may join, or `{:error, :not_found}`."
  def get_channel_for_voice(%User{} = user, channel_id) do
    case authorize_channel(user, channel_id, :join_voice) do
      {:ok, %Channel{kind: "voice"} = channel, _} -> {:ok, channel}
      _ -> {:error, :not_found}
    end
  end

  @doc "Ids of the community's voice channels (their LiveKit rooms)."
  def voice_room_ids(community_id), do: voice_rooms(community_id)

  defp voice_rooms(community_id) do
    Repo.all(
      from ch in Channel,
        where: ch.community_id == ^community_id and ch.kind == "voice",
        select: ch.id
    )
  end

  ## Invites

  @doc """
  Creates an invite link. Options: `"expires_in_hours"` (1 to 720, default 168)
  and `"max_uses"` (1 to 1000, or nil for unlimited). Returns the raw token
  once; only its hash is stored.
  """
  def create_invite(%User{} = user, community_id, opts \\ %{}) do
    with {:ok, _} <- authorize(user, community_id, :manage_invites),
         {:ok, hours} <-
           int_option(opts, "expires_in_hours", @default_invite_hours, 1..@max_invite_hours),
         {:ok, max_uses} <- int_option(opts, "max_uses", nil, 1..1000) do
      raw = :crypto.strong_rand_bytes(32)

      invite =
        Repo.insert!(%Invite{
          community_id: community_id,
          created_by_id: user.id,
          token_hash: hash(raw),
          expires_at: DateTime.add(DateTime.utc_now(:second), hours, :hour),
          max_uses: max_uses
        })

      {:ok, Base.url_encode64(raw, padding: false), invite}
    end
  end

  @doc "Active invites of a community (not expired, revoked or used up), for its owner."
  def list_invites(%User{} = user, community_id) do
    with {:ok, _} <- authorize(user, community_id, :manage_invites) do
      {:ok,
       Repo.all(
         from i in active_invites(),
           where: i.community_id == ^community_id,
           order_by: [desc: i.inserted_at]
       )}
    end
  end

  def revoke_invite(%User{} = user, invite_id) do
    with {:ok, _} <- Ecto.UUID.cast(invite_id),
         %Invite{} = invite <- Repo.get(Invite, invite_id),
         {:ok, _} <- authorize(user, invite.community_id, :manage_invites) do
      invite |> Ecto.Changeset.change(revoked_at: DateTime.utc_now(:second)) |> Repo.update!()
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "What an invite leads to, so the user can decide before joining."
  def preview_invite(token) do
    case find_active_invite(token) do
      %Invite{} = invite -> {:ok, %{community: Repo.get!(Community, invite.community_id)}}
      nil -> {:error, :invalid_invite}
    end
  end

  @doc """
  Joins the community behind an invite. Already being a member is fine and does
  not use up the invite. The use counter is increased in the same statement that
  checks the limits, so two people cannot both take the last use.
  """
  def accept_invite(%User{} = user, token) do
    with %Invite{} = invite <- find_active_invite(token) || {:error, :invalid_invite} do
      if Repo.get_by(Membership, community_id: invite.community_id, user_id: user.id) do
        {:ok, Repo.get!(Community, invite.community_id)}
      else
        join_with_invite(user, invite)
      end
    end
  end

  defp join_with_invite(user, invite) do
    Multi.new()
    |> Multi.update_all(:use, from(i in active_invites(), where: i.id == ^invite.id),
      inc: [uses: 1]
    )
    |> Multi.run(:check, fn _repo, %{use: {count, _}} ->
      if count == 1, do: {:ok, :used}, else: {:error, :invalid_invite}
    end)
    |> Multi.insert(
      :membership,
      %Membership{community_id: invite.community_id, user_id: user.id, role: "member"},
      on_conflict: :nothing,
      conflict_target: [:community_id, :user_id]
    )
    |> Repo.transaction()
    |> case do
      {:ok, _} ->
        Events.broadcast(invite.community_id, "member_joined", %{
          user_id: user.id,
          display_name: user.display_name
        })

        Events.memberships_changed(user.id)

        {:ok, Repo.get!(Community, invite.community_id)}

      {:error, :check, reason, _} ->
        {:error, reason}
    end
  end

  ## Account deletion and export (used by Nosilence.Privacy)

  @doc "Communities the user owns, with how many members each has."
  def owned_communities(%User{id: user_id}) do
    Repo.all(
      from c in Community,
        join: m in Membership,
        on: m.community_id == c.id and m.user_id == ^user_id and m.role == "owner",
        join: all in Membership,
        on: all.community_id == c.id,
        group_by: c.id,
        order_by: c.name,
        select: %{id: c.id, name: c.name, member_count: count(all.id)}
    )
  end

  @doc "The user's memberships, for their data export."
  def memberships_of(%User{id: user_id}) do
    Repo.all(
      from m in Membership,
        join: c in assoc(m, :community),
        where: m.user_id == ^user_id,
        order_by: m.inserted_at,
        select: %{community: c.name, role: m.role, joined_at: m.inserted_at}
    )
  end

  @doc "Invites the user created, for their data export."
  def invites_created_by(%User{id: user_id}) do
    Repo.all(
      from i in Invite,
        join: c in Community,
        on: c.id == i.community_id,
        where: i.created_by_id == ^user_id,
        order_by: i.inserted_at,
        select: %{
          community: c.name,
          created_at: i.inserted_at,
          expires_at: i.expires_at,
          uses: i.uses
        }
    )
  end

  @doc "Ids of the voice channels (LiveKit rooms) of the communities the user is in."
  def voice_rooms_of(%User{id: user_id}) do
    Repo.all(
      from ch in Channel,
        join: m in Membership,
        on: m.community_id == ch.community_id and m.user_id == ^user_id,
        where: ch.kind == "voice",
        select: ch.id
    )
  end

  @doc "Ids of the communities the user is a member of (not owner)."
  def member_community_ids(%User{id: user_id}) do
    Repo.all(
      from m in Membership,
        where: m.user_id == ^user_id and m.role != "owner",
        select: m.community_id
    )
  end

  @doc "Deletes invites that expired, were revoked or used up more than `days` ago."
  def delete_stale_invites(days) do
    cutoff = DateTime.add(DateTime.utc_now(:second), -days, :day)

    {count, _} =
      Repo.delete_all(
        from i in Invite,
          where:
            i.expires_at < ^cutoff or i.revoked_at < ^cutoff or
              (not is_nil(i.max_uses) and i.uses >= i.max_uses and i.inserted_at < ^cutoff)
      )

    count
  end

  defp find_active_invite(token) when is_binary(token) do
    case Base.url_decode64(token, padding: false) do
      {:ok, raw} when byte_size(raw) == 32 ->
        Repo.one(from i in active_invites(), where: i.token_hash == ^hash(raw))

      _ ->
        nil
    end
  end

  defp find_active_invite(_), do: nil

  defp active_invites do
    now = DateTime.utc_now(:second)

    from i in Invite,
      where:
        is_nil(i.revoked_at) and i.expires_at > ^now and
          (is_nil(i.max_uses) or i.uses < i.max_uses)
  end

  ## Authorisation

  @doc """
  The user's membership if they may perform `action` in the community.
  `{:error, :not_found}` for non-members, `{:error, :forbidden}` for members
  whose role does not allow it. Other contexts use this instead of reading
  memberships themselves.
  """
  def authorize(%User{id: user_id}, community_id, action) do
    with {:ok, community_id} <- Ecto.UUID.cast(community_id),
         %Membership{} = membership <-
           Repo.get_by(Membership, community_id: community_id, user_id: user_id) do
      if Policy.can?(membership, action), do: {:ok, membership}, else: {:error, :forbidden}
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "Like `authorize/3`, for the community that owns a channel."
  def authorize_channel(%User{} = user, channel_id, action) do
    with {:ok, _} <- Ecto.UUID.cast(channel_id),
         %Channel{} = channel <- Repo.get(Channel, channel_id),
         {:ok, membership} <- authorize(user, channel.community_id, action) do
      {:ok, channel, membership}
    else
      {:error, :forbidden} -> {:error, :forbidden}
      _ -> {:error, :not_found}
    end
  end

  defp int_option(opts, key, default, range) do
    case Map.get(opts, key) do
      nil ->
        {:ok, default}

      value when is_integer(value) ->
        if value in range, do: {:ok, value}, else: {:error, {:invalid, key}}

      _ ->
        {:error, {:invalid, key}}
    end
  end

  defp hash(raw), do: :crypto.hash(:sha256, raw)
end
