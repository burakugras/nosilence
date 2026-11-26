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

  alias Nosilence.{Accounts, Communities, Events, Messaging, Repo, TrafficLog, Voice}
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
  has one), `"delete_messages"` (boolean) and `"hand_over"`: community id =>
  up to three member ids, in order, to offer an owned community to instead of
  deleting it (ADR 0012). `:ok` or `{:error, field}`.
  """
  def delete_account(%User{} = user, attrs) do
    hand_over = if is_map(attrs["hand_over"]), do: attrs["hand_over"], else: %{}

    with :ok <- Accounts.verify_deletion(user, attrs) do
      {handed, owned} =
        Communities.owned_communities(user)
        |> Enum.split_with(&Map.has_key?(hand_over, &1.id))

      member_of = Communities.member_community_ids(user)
      rooms = Communities.voice_rooms_of(user)

      result =
        Repo.transaction(fn ->
          # Offered to the chosen members; ownerless until one of them accepts.
          for %{id: id} <- handed do
            case Nosilence.Communities.Succession.offer_on_account_deletion(
                   user,
                   id,
                   hand_over[id]
                 ) do
              {:ok, _} -> :ok
              {:error, _reason} -> Repo.rollback(:hand_over)
            end
          end

          closed =
            Enum.flat_map(owned, fn %{id: id} ->
              {:ok, %{voice_rooms: rooms}} = Communities.delete_community(user, id)
              rooms
            end)

          for id <- member_of, do: :ok = Communities.leave_community(user, id)

          if attrs["delete_messages"] == true do
            Messaging.delete_messages_by(user)
            Nosilence.Social.delete_messages_by(user)
          end

          :ok = Accounts.delete_user(user)
          closed
        end)

      case result do
        {:ok, closed_rooms} ->
          after_deletion(user, attrs, member_of, handed, rooms, closed_rooms)

        # Invalid candidates: nothing was deleted.
        {:error, :hand_over} ->
          {:error, :hand_over}
      end
    end
  end

  defp after_deletion(user, attrs, member_of, handed, rooms, closed_rooms) do
    # Open pages in the other communities update at once: the user's messages
    # turn into "Deleted user", or disappear if they asked for that.
    messages_deleted = attrs["delete_messages"] == true

    for id <- member_of do
      Events.broadcast(id, "account_deleted", %{
        user_id: user.id,
        messages_deleted: messages_deleted
      })
    end

    # Outside the transaction: close owned rooms, leave the others, end live connections.
    Voice.close_rooms(closed_rooms)
    for %{id: id} <- handed, do: Events.broadcast(id, "member_removed", %{user_id: user.id})
    Voice.remove_from_rooms(rooms -- closed_rooms, user.id)
    NosilenceWeb.Gateway.Socket.disconnect_user(user.id)
    :ok
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
      conversation_messages: Nosilence.Social.messages_by(user),
      friends: Nosilence.Social.list_friends(user),
      read_positions: Messaging.read_states_of(user),
      invites_created: Communities.invites_created_by(user),
      traffic_records: TrafficLog.for_user(user.id)
    }
  end
end
