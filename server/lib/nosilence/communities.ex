# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities do
  @moduledoc """
  Communities context: communities, members and roles, voice channels and invites.

  Every function that acts for a user checks membership and `Policy` first.
  Non-members get `{:error, :not_found}`, never `:forbidden`, so they cannot
  learn which communities or channels exist.
  """

  import Ecto.Query

  alias Ecto.Multi
  alias Nosilence.Accounts.User
  alias Nosilence.Communities.{Channel, Community, Invite, Membership, Policy}
  alias Nosilence.Repo

  @default_invite_hours 7 * 24
  @max_invite_hours 30 * 24

  ## Communities

  @doc "Creates a community owned by `user`, with one voice channel to start with."
  def create_community(%User{} = user, attrs) do
    Multi.new()
    |> Multi.insert(:community, Community.changeset(%Community{}, attrs))
    |> Multi.insert(:membership, fn %{community: c} ->
      %Membership{community_id: c.id, user_id: user.id, role: "owner"}
    end)
    |> Multi.insert(:channel, fn %{community: c} ->
      Channel.changeset(%Channel{community_id: c.id}, %{"name" => "General"})
    end)
    |> Repo.transaction()
    |> case do
      {:ok, %{community: community}} -> {:ok, community}
      {:error, :community, changeset, _} -> {:error, changeset}
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

  @doc "The community, its voice channels and the user's membership, for members only."
  def get_community(%User{} = user, community_id) do
    with {:ok, membership} <- authorize(user, community_id, :view) do
      community = Repo.get!(Community, community_id)

      channels =
        Repo.all(
          from ch in Channel, where: ch.community_id == ^community.id, order_by: ch.inserted_at
        )

      {:ok, %{community: community, channels: channels, membership: membership}}
    end
  end

  def delete_community(%User{} = user, community_id) do
    with {:ok, _} <- authorize(user, community_id, :delete_community) do
      Repo.delete_all(from c in Community, where: c.id == ^community_id)
      :ok
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
           order_by: [desc: m.role == "owner", asc: u.display_name],
           select: %{user_id: u.id, display_name: u.display_name, role: m.role}
       )}
    end
  end

  def remove_member(%User{} = owner, community_id, member_user_id) do
    with {:ok, _} <- authorize(owner, community_id, :remove_member) do
      {count, _} =
        Repo.delete_all(
          from m in Membership,
            where:
              m.community_id == ^community_id and m.user_id == ^member_user_id and
                m.role != "owner"
        )

      if count == 1, do: :ok, else: {:error, :not_found}
    end
  end

  @doc "Leaves a community. The owner cannot leave; they delete the community instead."
  def leave_community(%User{} = user, community_id) do
    with {:ok, membership} <- authorize(user, community_id, :leave) do
      Repo.delete!(membership)
      :ok
    end
  end

  ## Channels

  def create_channel(%User{} = user, community_id, attrs) do
    with {:ok, _} <- authorize(user, community_id, :create_channel) do
      %Channel{community_id: community_id}
      |> Channel.changeset(Map.take(attrs, ["name", "capacity"]))
      |> Repo.insert()
    end
  end

  @doc "A voice channel the user may join, or `{:error, :not_found}`."
  def get_channel_for_voice(%User{} = user, channel_id) do
    with {:ok, _} <- Ecto.UUID.cast(channel_id),
         %Channel{} = channel <- Repo.get(Channel, channel_id),
         {:ok, _} <- authorize(user, channel.community_id, :join_voice) do
      {:ok, channel}
    else
      _ -> {:error, :not_found}
    end
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
      {:ok, _} -> {:ok, Repo.get!(Community, invite.community_id)}
      {:error, :check, reason, _} -> {:error, reason}
    end
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

  defp authorize(%User{id: user_id}, community_id, action) do
    with {:ok, community_id} <- Ecto.UUID.cast(community_id),
         %Membership{} = membership <-
           Repo.get_by(Membership, community_id: community_id, user_id: user_id) do
      if Policy.can?(membership, action), do: {:ok, membership}, else: {:error, :forbidden}
    else
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
