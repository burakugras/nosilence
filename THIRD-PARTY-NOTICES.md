# Third-party notices

Nosilence is licensed under AGPL-3.0-only. It depends on the open-source software
listed below. Every license here is permissive (MIT or Apache-2.0) and compatible
with AGPL-3.0. Each package ships its own license text and copyright notice in its
source; full license texts will be bundled with distributed builds (web and desktop).

Keep this file up to date: every new dependency is checked for license compatibility
and added here in the same change.

Last reviewed: 2026-11-17.

## Server (Elixir, `server/mix.lock`)

| Package | Version | License |
|---|---|---|
| bandit | 1.15.0 | MIT |
| db_connection | 2.10.2 | Apache-2.0 |
| decimal | 3.2.0 | Apache-2.0 |
| dns_cluster | 0.2.0 | MIT |
| ecto | 3.14.3 | Apache-2.0 |
| ecto_sql | 3.14.0 | Apache-2.0 |
| expo | 1.1.1 | Apache-2.0 |
| finch | 0.24.0 | MIT |
| gettext | 1.0.2 | Apache-2.0 |
| hpax | 1.1.0 | Apache-2.0 |
| idna | 7.1.0 | MIT |
| jason | 1.4.5 | Apache-2.0 |
| mime | 2.0.7 | Apache-2.0 |
| mint | 1.11.0 | Apache-2.0 |
| nimble_options | 1.2.0 | Apache-2.0 |
| nimble_pool | 1.2.0 | Apache-2.0 |
| phoenix | 1.8.16 | MIT |
| phoenix_ecto | 4.7.0 | MIT |
| phoenix_pubsub | 2.4.1 | MIT |
| phoenix_template | 1.1.0 | MIT |
| plug | 1.20.3 | Apache-2.0 |
| plug_crypto | 2.2.1 | Apache-2.0 |
| postgrex | 0.22.4 | Apache-2.0 |
| req | 0.7.5 | Apache-2.0 |
| swoosh | 1.29.3 | MIT |
| telemetry | 1.4.3 | Apache-2.0 |
| telemetry_metrics | 1.2.0 | Apache-2.0 |
| telemetry_poller | 1.3.0 | Apache-2.0 |
| thousand_island | 1.6.0 | MIT |
| websock | 0.5.3 | MIT |
| websock_adapter | 0.7.2 | MIT |

## Client runtime (npm, shipped in the web bundle)

| Package | Version | License |
|---|---|---|
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| scheduler | 0.28.0 | MIT |

Development-only tools (Vite, Vitest, TypeScript, oxlint, Prettier, Testing Library)
are not shipped to users.

## Services used, not distributed

| Software | License |
|---|---|
| LiveKit server | Apache-2.0 |
| PostgreSQL | PostgreSQL License |
