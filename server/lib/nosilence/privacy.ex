# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Privacy do
  @moduledoc """
  The user's rights over their data (ADR 0009): download everything we hold
  about them, and delete their account.

  Deleting an account removes the user, their sessions and memberships, and
  the communities they own (with everything in them). Their messages in other
  communities stay, shown as from "Deleted user", unless they ask for those to
  be deleted too. Traffic records are kept for their legal retention period.
  """

  alias Nosilence.{Accounts, Communities, Messaging, Repo, TrafficLog, Voice}
  alias Nosilence.Accounts.User

  @doc "What deleting the account would remove, to show before the user confirms."
  def deletion_preview(%User{} = user) do
    %{
      owned_communities: Communities.owned_communities(user),
      needs_password: not is_nil(user.hashed_password)
    }
  end

  @doc """
  Deletes the account. `attrs`: `"confirm_email"`, `"password"` (if the account
  has one) and `"delete_messages"` (boolean). `:ok` or `{:error, field}`.
  """
  def delete_account(%User{} = user, attrs) do
    with :ok <- Accounts.verify_deletion(user, attrs) do
      owned = Communities.owned_communities(user)
      member_of = Communities.member_community_ids(user)
      rooms = Communities.voice_rooms_of(user)

      {:ok, closed_rooms} =
        Repo.transaction(fn ->
          closed =
            Enum.flat_map(owned, fn %{id: id} ->
              {:ok, %{voice_rooms: rooms}} = Communities.delete_community(user, id)
              rooms
            end)

          for id <- member_of, do: :ok = Communities.leave_community(user, id)
          if attrs["delete_messages"] == true, do: Messaging.delete_messages_by(user)
          :ok = Accounts.delete_user(user)
          closed
        end)

      # Outside the transaction: close owned rooms, leave the others, end live connections.
      Voice.close_rooms(closed_rooms)
      Voice.remove_from_rooms(rooms -- closed_rooms, user.id)
      NosilenceWeb.Gateway.Socket.disconnect_user(user.id)
      :ok
    end
  end

  @doc "Everything we hold about the user, as one map (served as a JSON download)."
  def export(%User{} = user) do
    %{
      exported_at: DateTime.utc_now(:second),
      about:
        "Your Nosilence data. Voice is end-to-end encrypted and never stored, so there is none here.",
      account: Accounts.export_account(user),
      memberships: Communities.memberships_of(user),
      messages: Messaging.messages_by(user),
      invites_created: Communities.invites_created_by(user),
      traffic_records: TrafficLog.for_user(user.id)
    }
  end
end
