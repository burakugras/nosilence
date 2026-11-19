# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Communities.Names do
  @moduledoc false
  import Ecto.Changeset

  # Trimmed, non-empty, bounded, no control or invisible formatting characters.
  def validate(changeset, field, max: max) do
    changeset
    |> update_change(field, &String.trim/1)
    |> validate_required([field])
    |> validate_length(field, max: max)
    |> validate_format(field, ~r/\A[^\p{Cc}\p{Cf}]*\z/u, message: "has invalid characters")
  end
end
