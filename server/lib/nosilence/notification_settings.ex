# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.NotificationSettings do
  @moduledoc """
  How a community, a text channel or a conversation notifies one user (ADR 0018):
  `"all"` messages, `"mentions"` only, or `"none"`, optionally until a time.

  Without a setting, everything notifies. A channel's own setting comes before
  its community's. The apps apply the levels to notifications; the server uses
  them to leave out messages from communities set to nothing (only mentions are
  still sent there, for the mention count). Settings sync across the user's
  devices through `notification_settings_changed` on their own topic.
  """

  import Ecto.Query
  import Ecto.Changeset

  alias Nosilence.Accounts.User
  alias Nosilence.{Communities, Events, Repo, Social}

  defmodule Setting do
    @moduledoc false
    use Ecto.Schema
    @primary_key false
    @foreign_key_type :binary_id
    schema "notification_settings" do
      field :user_id, :binary_id, primary_key: true
      field :target_type, :string, primary_key: true
      field :target_id, :binary_id, primary_key: true
      field :level, :string
      field :until, :utc_datetime
      timestamps(type: :utc_datetime)
    end
  end

  @levels ~w(all mentions none)
  @types ~w(community channel conversation)
  @max_days 30

  @doc "The user's settings that still apply, as maps for the client."
  def list(%User{id: user_id}) do
    now = DateTime.utc_now()

    Repo.all(
      from s in Setting,
        where: s.user_id == ^user_id and (is_nil(s.until) or s.until > ^now),
        select: %{type: s.target_type, id: s.target_id, level: s.level, until: s.until}
    )
  end

  @doc """
  Sets the level for a community, channel or conversation the user belongs to.
  `"until"` is an ISO time (at most 30 days ahead) or nil for no end.
  """
  def put(%User{} = user, type, id, attrs) when is_map(attrs) do
    with :ok <- check_type(type),
         {:ok, id} <- cast_id(id),
         :ok <- belongs(user, type, id),
         {:ok, values} <- validate(attrs) do
      now = DateTime.utc_now(:second)

      Repo.insert!(
        %Setting{
          user_id: user.id,
          target_type: type,
          target_id: id,
          level: values.level,
          until: values[:until],
          inserted_at: now,
          updated_at: now
        },
        on_conflict: [set: [level: values.level, until: values[:until], updated_at: now]],
        conflict_target: [:user_id, :target_type, :target_id]
      )

      changed(user)
      :ok
    end
  end

  def put(_user, _type, _id, _attrs), do: {:error, {:invalid, "level"}}

  @doc "Back to the default for a community, channel or conversation."
  def clear(%User{} = user, type, id) do
    with :ok <- check_type(type),
         {:ok, id} <- cast_id(id) do
      Repo.delete_all(
        from s in Setting,
          where: s.user_id == ^user.id and s.target_type == ^type and s.target_id == ^id
      )

      changed(user)
      :ok
    end
  end

  @doc """
  The level that applies to a channel of a community for `user_id` now: the
  channel's own, else the community's, else `"all"`.
  """
  def level(user_id, community_id, channel_id) do
    now = DateTime.utc_now()

    found =
      Repo.all(
        from s in Setting,
          where:
            s.user_id == ^user_id and (is_nil(s.until) or s.until > ^now) and
              ((s.target_type == "channel" and s.target_id == ^channel_id) or
                 (s.target_type == "community" and s.target_id == ^community_id)),
          select: {s.target_type, s.level}
      )
      |> Map.new()

    found["channel"] || found["community"] || "all"
  end

  defp validate(attrs) do
    types = %{level: :string, until: :utc_datetime}

    {%{}, types}
    |> cast(attrs, [:level, :until])
    |> validate_required([:level])
    |> validate_inclusion(:level, @levels)
    |> validate_change(:until, fn :until, at ->
      now = DateTime.utc_now()

      cond do
        DateTime.compare(at, now) != :gt -> [until: "must be in the future"]
        DateTime.diff(at, now, :day) >= @max_days -> [until: "is too far away"]
        true -> []
      end
    end)
    |> apply_action(:insert)
  end

  defp check_type(type) when type in @types, do: :ok
  defp check_type(_), do: {:error, {:invalid, "type"}}

  defp cast_id(id) do
    case Ecto.UUID.cast(id) do
      {:ok, id} -> {:ok, id}
      :error -> {:error, :not_found}
    end
  end

  defp belongs(user, "community", id) do
    case Communities.authorize(user, id, :view) do
      {:ok, _} -> :ok
      _ -> {:error, :not_found}
    end
  end

  defp belongs(user, "channel", id) do
    case Communities.authorize_channel(user, id, :view) do
      {:ok, %{kind: "text"}, _} -> :ok
      _ -> {:error, :not_found}
    end
  end

  defp belongs(user, "conversation", id),
    do: if(Social.member?(user, id), do: :ok, else: {:error, :not_found})

  defp changed(user), do: Events.to_user(user.id, "notification_settings_changed", %{})
end
