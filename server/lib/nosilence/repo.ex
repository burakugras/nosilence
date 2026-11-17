defmodule Nosilence.Repo do
  use Ecto.Repo,
    otp_app: :nosilence,
    adapter: Ecto.Adapters.Postgres
end
