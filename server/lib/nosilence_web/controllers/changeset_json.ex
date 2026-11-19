# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.ChangesetJSON do
  @moduledoc "Turns changeset errors into `%{errors: %{field => [message]}}`."

  def errors(%Ecto.Changeset{} = changeset) do
    %{
      errors:
        Ecto.Changeset.traverse_errors(changeset, fn {message, opts} ->
          Regex.replace(~r"%{(\w+)}", message, fn _, key ->
            opts |> Keyword.get(String.to_existing_atom(key), key) |> to_string()
          end)
        end)
    }
  end
end
