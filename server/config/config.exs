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

# Text messages (limits are configuration, see docs/ROADMAP.md rule 6).
config :nosilence, Nosilence.Messaging, max_message_length: 2000, page_size: 50

# Never write secrets or message content to the logs: these request parameters
# show as [FILTERED].
config :phoenix, :filter_parameters, ["password", "token", "secret", "code", "state", "text"]

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{config_env()}.exs"
