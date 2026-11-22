# This file is responsible for configuring your application
# and its dependencies with the aid of the Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
import Config

config :nosilence,
  ecto_repos: [Nosilence.Repo],
  generators: [timestamp_type: :utc_datetime, binary_id: true]

# Configure the endpoint
config :nosilence, NosilenceWeb.Endpoint,
  url: [host: "localhost"],
  adapter: Bandit.PhoenixAdapter,
  render_errors: [
    formats: [json: NosilenceWeb.ErrorJSON],
    layout: false
  ],
  pubsub_server: Nosilence.PubSub,
  live_view: [signing_salt: "IROc+Ek2"]

# Configure the mailer
#
# By default it uses the "Local" adapter which stores the emails
# locally. You can see the emails in your browser, at "/dev/mailbox".
#
# For production it's recommended to configure a different adapter
# at the `config/runtime.exs`.
config :nosilence, Nosilence.Mailer, adapter: Swoosh.Adapters.Local

# Configure Elixir's Logger
config :logger, :default_formatter,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

# Voice channel limits. Capacity is per channel, between 2 and the maximum.
config :nosilence, Nosilence.Communities,
  default_channel_capacity: 8,
  max_channel_capacity: 8

# Origins of the desktop app's WebView (Tauri on Windows). They get CORS on the API,
# may open the gateway and receive session tokens in JSON instead of a cookie.
config :nosilence, desktop_origins: ["http://tauri.localhost", "https://tauri.localhost"]

# Legally required traffic records (ADR 0009). The key is set per environment.
config :nosilence, Nosilence.TrafficLog, retention_days: 365

# Nightly clean-up of expired data (ADR 0009).
config :nosilence, Nosilence.Retention,
  enabled: true,
  interval_ms: 24 * 60 * 60_000,
  # Invites that expired, were revoked or used up are kept this long, then deleted.
  stale_invite_days: 30

# Rate limits per key (ADR 0009): `limit` hits in any `window` ms. Going over a
# limit with a `penalty` blocks for that long, longer if it repeats soon.
config :nosilence, Nosilence.RateLimit,
  # per email address, and per IP address
  sign_in_email: [
    limit: 5,
    window: 60_000,
    penalty: 60_000,
    repeat_penalty: 15 * 60_000,
    repeat_window: 60 * 60_000
  ],
  sign_in_ip: [
    limit: 20,
    window: 60_000,
    penalty: 60_000,
    repeat_penalty: 15 * 60_000,
    repeat_window: 60 * 60_000
  ],
  # emails sent to one address (confirmation, password reset)
  email_address: [limit: 3, window: 60 * 60_000],
  # requests that send email, per IP address
  email_ip: [limit: 20, window: 60 * 60_000],
  # anonymous call quality reports per user (ADR 0011)
  call_report: [limit: 5, window: 60_000],
  # messages per user: 10 in 10 seconds; over it, 30 s pause, 2 min if it repeats
  message: [
    limit: 10,
    window: 10_000,
    penalty: 30_000,
    repeat_penalty: 2 * 60_000,
    repeat_window: 5 * 60_000
  ]

# Text messages (limits are configuration, see docs/ROADMAP.md rule 6).
config :nosilence, Nosilence.Messaging, max_message_length: 2000, page_size: 50

# Never write secrets or message content to the logs: these request parameters
# show as [FILTERED].
config :phoenix, :filter_parameters, ["password", "token", "secret", "code", "state", "text"]

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
