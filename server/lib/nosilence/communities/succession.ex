# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Succession do
  @moduledoc """
  Handing a community over (ADR 0012, designed with Burak).

  The owner picks up to three members in order. The first is asked and has
  `response_hours` (72) to accept; if they decline, do not answer in time, or are
  no longer a member, the next one is asked. Only these candidates can ever
  become owner: no moderator or member can claim a community.

  * Voluntary (the owner stays): if nobody accepts, nothing changes. A new
    owner cannot offer the community again for `cooldown_days` (7), so a
    community cannot be passed around quickly.
  * The owner deleted their account: until someone accepts, the community has
    no owner (moderators keep their powers); if nobody accepts, every member is
    warned and the community is deleted after `final_notice_days` (7).

  Candidates are told by email and in the app. `Nosilence.Communities.SuccessionWorker`
  checks the deadlines.
  """
  import Ecto.Query

  alias Nosilence.{Events, Repo}
  alias Nosilence.Accounts.User
  alias Nosilence.Communities
  alias Nosilence.Communities.{Community, Membership, OwnershipTransfer}

  @open ~w(offered deleting)

  @doc "Starts a voluntary transfer. `candidate_ids`: 1 to 3 members, in order."
  def offer(%User{} = owner, community_id, candidate_ids) do
    with {:ok, membership} <- Communities.authorize(owner, community_id, :transfer_ownership),
         :ok <- cooled_down(membership.community_id),
         {:ok, candidates} <- candidates(membership.community_id, candidate_ids, owner.id) do
      cancel_open(membership.community_id)
      start(membership.community_id, candidates, "voluntary")
    end
  end

  @doc """
  Starts a transfer for an owner who is deleting their account (before the
  account is gone). `{:ok, transfer}` or `{:error, reason}`. The cooldown does
  not apply: refusing would leave only deleting the community.
  """
  def offer_on_account_deletion(%User{} = owner, community_id, candidate_ids) do
    with {:ok, membership} <- Communities.authorize(owner, community_id, :transfer_ownership),
         {:ok, candidates} <- candidates(membership.community_id, candidate_ids, owner.id) do
      cancel_open(membership.community_id)
      start(membership.community_id, candidates, "account_deleted")
    end
  end

  @doc "The owner withdraws a voluntary transfer."
  def cancel(%User{} = owner, community_id) do
    with {:ok, membership} <- Communities.authorize(owner, community_id, :transfer_ownership) do
      cancel_open(membership.community_id)
      changed(membership.community_id)
      :ok
    end
  end

  @doc """
  The open transfer of a community, for its members (or nil), and when the
  owner may start a voluntary one (nil: now).
  """
  def current(%User{} = user, community_id) do
    with {:ok, membership} <- Communities.authorize(user, community_id, :view) do
      {:ok, open_transfer(membership.community_id), available_at(membership.community_id)}
    end
  end

  @doc "Offers waiting for this user's answer, with the community name."
  def offers_for(%User{id: user_id}) do
    Repo.all(
      from t in OwnershipTransfer,
        join: c in Community,
        on: c.id == t.community_id,
        # PostgreSQL arrays count from 1.
        where:
          t.status == "offered" and
            fragment("?[? + 1]", t.candidates, t.current) == type(^user_id, Ecto.UUID),
        select: %{
          id: t.id,
          community: %{id: c.id, name: c.name},
          deadline: t.deadline,
          kind: t.kind
        }
    )
  end

  @doc "The current candidate accepts: they become owner."
  def accept(%User{} = user, transfer_id) do
    with %OwnershipTransfer{} = t <- offered_to(user, transfer_id),
         %Membership{} = candidate <-
           Repo.get_by(Membership, community_id: t.community_id, user_id: user.id) do
      {:ok, previous} =
        Repo.transaction(fn ->
          # A voluntary transfer leaves the previous owner as a moderator.
          {_, previous} =
            Repo.update_all(
              from(m in Membership,
                where: m.community_id == ^t.community_id and m.role == "owner",
                select: m.user_id
              ),
              set: [role: "moderator"]
            )

          candidate |> Ecto.Changeset.change(role: "owner") |> Repo.update!()
          t |> Ecto.Changeset.change(status: "accepted") |> Repo.update!()
          previous
        end)

      # Both pages change at once: the old owner loses the owner's controls.
      for id <- previous,
          do:
            Events.broadcast(t.community_id, "member_updated", %{user_id: id, role: "moderator"})

      Events.broadcast(t.community_id, "member_updated", %{user_id: user.id, role: "owner"})
      changed(t.community_id)
      :ok
    else
      _ -> {:error, :not_found}
    end
  end

  @doc "The current candidate declines: the next one is asked."
  def decline(%User{} = user, transfer_id) do
    case offered_to(user, transfer_id) do
      %OwnershipTransfer{} = t ->
        advance(t)
        :ok

      nil ->
        {:error, :not_found}
    end
  end

  @doc """
  Moves on every offer past its deadline and deletes communities whose final
  notice is over. Called by the worker; returns how many were handled.
  """
  def tick(now \\ DateTime.utc_now(:second)) do
    expired =
      Repo.all(from t in OwnershipTransfer, where: t.status == "offered" and t.deadline < ^now)

    Enum.each(expired, &advance/1)

    due =
      Repo.all(from t in OwnershipTransfer, where: t.status == "deleting" and t.delete_at < ^now)

    Enum.each(due, &delete_community/1)
    length(expired) + length(due)
  end

  ## Internals

  defp start(community_id, candidates, kind) do
    t =
      Repo.insert!(%OwnershipTransfer{
        community_id: community_id,
        candidates: candidates,
        current: 0,
        kind: kind,
        deadline: deadline()
      })

    ask(t)
    {:ok, t}
  end

  # Ask the current candidate, skipping anyone who has left in the meantime.
  defp ask(%OwnershipTransfer{} = t) do
    candidate = Enum.at(t.candidates, t.current)

    if candidate && Repo.get_by(Membership, community_id: t.community_id, user_id: candidate) do
      notify_candidate(t, candidate)
      changed(t.community_id)
    else
      advance(t)
    end
  end

  defp advance(%OwnershipTransfer{} = t) do
    next = t.current + 1

    cond do
      next < length(t.candidates) ->
        t |> Ecto.Changeset.change(current: next, deadline: deadline()) |> Repo.update!() |> ask()

      t.kind == "voluntary" ->
        # Nobody accepted: the owner simply stays owner.
        t |> Ecto.Changeset.change(status: "declined") |> Repo.update!()
        changed(t.community_id)

      true ->
        # The owner is gone and nobody accepted: warn everyone, then delete.
        delete_at = DateTime.add(DateTime.utc_now(:second), config(:final_notice_days), :day)
        t |> Ecto.Changeset.change(status: "deleting", delete_at: delete_at) |> Repo.update!()
        changed(t.community_id)
    end
  end

  defp delete_community(%OwnershipTransfer{community_id: id}) do
    rooms = Communities.voice_room_ids(id)
    Repo.delete_all(from c in Community, where: c.id == ^id)
    Events.broadcast(id, "community_deleted", %{})
    Nosilence.Voice.close_rooms(rooms)
  end

  defp offered_to(%User{id: user_id}, transfer_id) do
    with {:ok, id} <- Ecto.UUID.cast(transfer_id),
         %OwnershipTransfer{status: "offered"} = t <- Repo.get(OwnershipTransfer, id),
         ^user_id <- Enum.at(t.candidates, t.current) do
      t
    else
      _ -> nil
    end
  end

  defp candidates(community_id, ids, owner_id) when is_list(ids) and length(ids) in 1..3 do
    with {:ok, ids} <- cast_all(ids),
         true <- length(Enum.uniq(ids)) == length(ids),
         false <- owner_id in ids,
         n when n == length(ids) <-
           Repo.aggregate(
             from(m in Membership, where: m.community_id == ^community_id and m.user_id in ^ids),
             :count
           ) do
      {:ok, ids}
    else
      _ -> {:error, {:invalid, "candidates"}}
    end
  end

  defp candidates(_community_id, _ids, _owner_id), do: {:error, {:invalid, "candidates"}}

  defp cast_all(ids) do
    Enum.reduce_while(ids, {:ok, []}, fn id, {:ok, acc} ->
      case Ecto.UUID.cast(id) do
        {:ok, uuid} -> {:cont, {:ok, acc ++ [uuid]}}
        :error -> {:halt, :error}
      end
    end)
  end

  defp cancel_open(community_id) do
    Repo.update_all(
      from(t in OwnershipTransfer, where: t.community_id == ^community_id and t.status in ^@open),
      set: [status: "declined"]
    )
  end

  defp cooled_down(community_id) do
    case available_at(community_id) do
      nil -> :ok
      until -> {:error, {:handover_cooldown, until}}
    end
  end

  # The end of the cooldown after the last accepted transfer, if still ahead.
  defp available_at(community_id) do
    accepted =
      Repo.one(
        from t in OwnershipTransfer,
          where: t.community_id == ^community_id and t.status == "accepted",
          select: max(t.updated_at)
      )

    until = accepted && DateTime.add(accepted, config(:cooldown_days), :day)
    if until && DateTime.after?(until, DateTime.utc_now()), do: until
  end

  defp open_transfer(community_id) do
    Repo.one(
      from t in OwnershipTransfer, where: t.community_id == ^community_id and t.status in ^@open
    )
  end

  defp notify_candidate(t, candidate_id) do
    with %User{} = user <- Nosilence.Accounts.get_user(candidate_id),
         %Community{} = community <- Repo.get(Community, t.community_id) do
      Nosilence.Accounts.UserNotifier.deliver_ownership_offer(user, community, t.deadline)
    end
  end

  # Members' pages show the transfer's state; candidates their offers.
  defp changed(community_id), do: Events.broadcast(community_id, "ownership_changed", %{})

  defp deadline,
    do: DateTime.add(DateTime.utc_now(:second), config(:response_hours), :hour)

  defp config(name),
    do: Application.fetch_env!(:nosilence, __MODULE__) |> Keyword.fetch!(name)
end
