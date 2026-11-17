import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
{env, _} = Code.eval_file("dotenv.exs", __DIR__)

config :nosilence, Nosilence.Repo,
  username: env.("POSTGRES_USER"),
  password: env.("POSTGRES_PASSWORD"),
  hostname: "127.0.0.1",
  database: "nosilence_test#{System.get_env("MIX_TEST_PARTITION")}",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: System.schedulers_online() * 2

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :nosilence, NosilenceWeb.Endpoint,
  http: [ip: {127, 0, 0, 1}, port: 4002],
  secret_key_base: "5aSxfr9O9TBMX7Eo3pewtwsYkLXwbHW9ebNNlCxj235Q3lHmRI7k+g00593wJReR",
  server: false

config :nosilence, dev_voice_tokens: true

# Fixed test values; tests never talk to a real LiveKit server.
config :nosilence, Nosilence.Voice,
  livekit_url: "ws://livekit.test:7880",
  api_key: "test-api-key",
  api_secret: "test-api-secret-that-is-at-least-32-bytes",
  token_ttl_seconds: 600

# In test we don't send emails
config :nosilence, Nosilence.Mailer, adapter: Swoosh.Adapters.Test

# Disable swoosh api client as it is only required for production adapters
config :swoosh, :api_client, false

# Print only warnings and errors during test
config :logger, level: :warning

# Initialize plugs at runtime for faster test compilation
config :phoenix, :plug_init_mode, :runtime

# Sort query params output of verified routes for robust url comparisons
config :phoenix,
  sort_verified_routes_query_params: true
