# SPDX-License-Identifier: AGPL-3.0-only
#
# Reads local development secrets from infra/.env so that the database and
# LiveKit share one source of truth. Real environment variables win, which
# lets CI provide its own values without a file.
#
# Usage in a config file:
#     {env, _} = Code.eval_file("dotenv.exs", __DIR__)
#     env.("POSTGRES_USER")

env_file = Path.expand("../../infra/.env", __DIR__)

values =
  if File.exists?(env_file) do
    env_file
    |> File.read!()
    |> String.split(~r/\R/)
    |> Enum.map(&String.trim/1)
    |> Enum.reject(&(&1 == "" or String.starts_with?(&1, "#")))
    |> Map.new(fn line ->
      [key, value] = String.split(line, "=", parts: 2)
      {String.trim(key), String.trim(value)}
    end)
  else
    %{}
  end

# env.("KEY") raises when missing; env.({"KEY", default}) returns the default instead.
fn
  {key, default} ->
    System.get_env(key) || Map.get(values, key, default)

  key ->
    System.get_env(key) || Map.get(values, key) ||
      raise "#{key} is not set. Copy infra/.env.example to infra/.env or export #{key}."
end
