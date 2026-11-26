# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Profiles do
  @moduledoc """
  Profile picture and status (ADR 0017).

  The picture is cropped and redrawn by the app (256×256 WebP, which also drops
  any location or camera data); the server checks it is a still WebP of at most
  256×256 and 256 KB and stores it. Only people who share a community or a
  conversation with its owner, or are their friends, can load it.

  The status is a choice (`online`, `dnd` for do not disturb, `invisible`) and an
  optional short text with an optional end. "Idle" is not stored: each app
  reports it on its live connection. Invisible people are never sent to others
  as online (`NosilenceWeb.Gateway.CommunityChannel`).
  """

  import Ecto.Changeset
  import Ecto.Query, only: [from: 2]

  alias Nosilence.Accounts.User
  alias Nosilence.{Events, Repo, Social}
  alias Nosilence.Profiles.{Avatar, Webp}

  @max_avatar_bytes 256 * 1024
  @avatar_px 256
  @min_avatar_px 16
  @statuses ~w(online dnd invisible)
  @max_status_text 60
  @max_status_days 30

  def max_avatar_bytes, do: @max_avatar_bytes

  @doc "Stores a new profile picture. `{:ok, user}` or `{:error, reason}`."
  def set_avatar(%User{} = user, image) when is_binary(image) do
    with :ok <- check_avatar(image),
         :ok <- profile_allowed(user) do
      now = DateTime.utc_now(:second)

      {:ok, user} =
        Repo.transaction(fn ->
          Repo.insert!(
            %Avatar{user_id: user.id, image: image, inserted_at: now, updated_at: now},
            on_conflict: [set: [image: image, updated_at: now]],
            conflict_target: :user_id
          )

          user |> change(avatar_version: (user.avatar_version || 0) + 1) |> Repo.update!()
        end)

      announce(user)
      {:ok, user}
    end
  end

  def set_avatar(_user, _image), do: {:error, :invalid_image}

  @doc "Removes the profile picture."
  def remove_avatar(%User{} = user) do
    Repo.delete_all(from a in Avatar, where: a.user_id == ^user.id)
    user = user |> change(avatar_version: nil) |> Repo.update!()
    announce(user)
    {:ok, user}
  end

  @doc """
  The picture of `user_id` for `viewer`: `{:ok, image}`, or `{:error, :not_found}`
  when there is none or the viewer may not see it (never told apart).
  """
  def get_avatar(%User{id: viewer}, user_id) do
    with {:ok, id} <- Ecto.UUID.cast(user_id),
         true <- may_see?(viewer, id),
         %Avatar{image: image} <- Repo.get(Avatar, id) do
      {:ok, image}
    else
      _ -> {:error, :not_found}
    end
  end

  defp may_see?(viewer, viewer), do: true

  defp may_see?(viewer, id),
    do:
      Social.friends?(viewer, id) or Social.share_community?(viewer, id) or
        Social.share_conversation?(viewer, id)

  @doc "The picture, for the user's own data export (Base64), or nil."
  def avatar_export(%User{id: id}) do
    case Repo.get(Avatar, id) do
      %Avatar{image: image} -> %{format: "image/webp", base64: Base.encode64(image)}
      nil -> nil
    end
  end

  defp check_avatar(image) when byte_size(image) > @max_avatar_bytes,
    do: {:error, :image_too_large}

  defp check_avatar(image) do
    case Webp.dimensions(image) do
      {:ok, {w, h}} when w in @min_avatar_px..@avatar_px and h in @min_avatar_px..@avatar_px ->
        :ok

      {:ok, _} ->
        {:error, :invalid_image}

      {:error, _} ->
        {:error, :invalid_image}
    end
  end

  @doc """
  Sets the status: `"status"` (online, dnd, invisible), `"text"` (up to 60
  characters, empty for none) and `"expires_at"` (ISO time, when the text goes
  away; empty for never, at most 30 days ahead).
  """
  def set_status(%User{} = user, attrs) when is_map(attrs) do
    text = if is_binary(attrs["text"]), do: String.trim(attrs["text"]), else: attrs["text"]

    changeset =
      user
      |> cast(
        %{status: attrs["status"], status_text: text, status_expires_at: attrs["expires_at"]},
        [
          :status,
          :status_text,
          :status_expires_at
        ]
      )
      |> validate_required([:status])
      |> validate_inclusion(:status, @statuses)
      |> validate_length(:status_text, max: @max_status_text)
      |> validate_change(:status_text, fn :status_text, value ->
        case Nosilence.Messaging.validate_text(value) do
          {:ok, _} -> []
          {:error, _} -> [status_text: "contains characters that are not allowed"]
        end
      end)
      |> validate_change(:status_expires_at, fn :status_expires_at, at ->
        now = DateTime.utc_now()

        cond do
          DateTime.compare(at, now) != :gt ->
            [status_expires_at: "must be in the future"]

          DateTime.diff(at, now, :day) >= @max_status_days ->
            [status_expires_at: "is too far away"]

          true ->
            []
        end
      end)
      # No text, no end.
      |> then(fn cs ->
        if get_field(cs, :status_text) in [nil, ""],
          do: cs |> put_change(:status_text, nil) |> put_change(:status_expires_at, nil),
          else: cs
      end)

    with :ok <- profile_allowed(user),
         {:ok, user} <- Repo.update(changeset) do
      announce(user)
      {:ok, user}
    end
  end

  def set_status(_user, _attrs), do: {:error, {:invalid, "status"}}

  @doc "The status text, or nil once it has ended."
  def status_text(%User{status_text: nil}), do: nil
  def status_text(%User{status_expires_at: nil, status_text: text}), do: text

  def status_text(%User{status_expires_at: at, status_text: text}),
    do: if(DateTime.compare(at, DateTime.utc_now()) == :gt, do: text)

  @doc "The profile fields the gateway shows next to a user (presence)."
  def presence_fields(%User{} = user) do
    text = status_text(user)

    %{
      display_name: user.display_name,
      avatar: user.avatar_version,
      status: user.status,
      status_text: text,
      status_expires_at: text && user.status_expires_at
    }
  end

  @doc "Server-side topic of a user's profile changes (never sent to clients as is)."
  def topic(user_id), do: "profile:" <> user_id

  # The user's community connections update what others see (CommunityChannel,
  # through the server-only topic); the user's own apps get the public fields.
  defp announce(user) do
    fields = presence_fields(user)
    Phoenix.PubSub.broadcast(Nosilence.PubSub, topic(user.id), {:profile_changed, fields})
    Events.to_user(user.id, "profile_changed", fields)
  end

  defp profile_allowed(user) do
    case Nosilence.RateLimit.hit(:profile, user.id) do
      :ok -> :ok
      {:error, :rate_limited, ms} -> {:error, :rate_limited, :profile, ms}
    end
  end
end
