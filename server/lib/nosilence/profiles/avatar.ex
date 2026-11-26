# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Profiles.Avatar do
  @moduledoc "A user's profile picture: one WebP image, kept apart from `users`."
  use Ecto.Schema

  @primary_key {:user_id, :binary_id, autogenerate: false}

  schema "user_avatars" do
    field :image, :binary
    timestamps(type: :utc_datetime)
  end
end
