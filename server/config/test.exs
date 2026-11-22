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

config :nosilence, app_url: "http://app.test", secure_cookies: false

# Tests stub Google's token endpoint with Req.Test; nothing leaves the machine.
config :nosilence, Nosilence.Accounts.Google,
  client_id: "test-client-id.apps.googleusercontent.com",
  client_secret: "test-client-secret",
  req_options: [plug: {Req.Test, Nosilence.Accounts.Google}]

# Cheap password hashing keeps the test suite fast. Never use these values elsewhere.
config :argon2_elixir, t_cost: 1, m_cost: 8

# Fixed test values; tests never talk to a real LiveKit server.
config :nosilence, Nosilence.Voice,
  livekit_url: "ws://livekit.test:7880",
  api_url: "http://livekit.test:7880",
  req_options: [plug: {Req.Test, Nosilence.Voice.LiveKitAPI}],
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

# Fail over to the next MLS committer quickly in tests.
config :nosilence, Nosilence.Voice.Group, commit_timeout_ms: 150

config :nosilence, desktop_origins: ["http://desktop.test"]

# All tests come from 127.0.0.1: per-IP limits would count the whole suite.
# Per-address and per-user limits keep their real values and are tested.
config :nosilence, Nosilence.RateLimit,
  sign_in_email: [limit: 5, window: 60_000, penalty: 60_000],
  sign_in_ip: [limit: 100_000, window: 60_000],
  email_address: [limit: 3, window: 60 * 60_000],
  email_ip: [limit: 100_000, window: 60 * 60_000],
  message: [
    limit: 10,
    window: 10_000,
    penalty: 30_000,
    repeat_penalty: 2 * 60_000,
    repeat_window: 5 * 60_000
  ],
  call_report: [limit: 5, window: 60_000],
  test_plain: [limit: 3, window: 200],
  test_penalty: [
    limit: 2,
    window: 60_000,
    penalty: 300,
    repeat_penalty: 900,
    repeat_window: 60_000
  ]

# Test-only key for traffic log encryption (not a secret; production uses TRAFFIC_LOG_KEY).
config :nosilence, Nosilence.TrafficLog, key: "H6pa5hGOzb/K7QR2tb+gC2wHj210nch6XTkOsaZal80="

config :nosilence, Nosilence.Retention, enabled: false

# Check LiveKit participants against MLS sessions quickly in tests.
config :nosilence, Nosilence.Voice.Watchdog, grace_ms: 50
