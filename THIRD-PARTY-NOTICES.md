# Third-party notices

Nosilence is licensed under AGPL-3.0-only. It depends on the open-source software
listed below. Every license here is permissive (MIT, Apache-2.0, BSD-3-Clause or 0BSD) and compatible
with AGPL-3.0. Each package ships its own license text and copyright notice in its
source; full license texts will be bundled with distributed builds (web and desktop).

Keep this file up to date: every new dependency is checked for license compatibility
and added here in the same change.

Last reviewed: 2026-11-19 (Phase 2a). CI runs `mix hex.audit` and `npm audit` on every push.

## Server (Elixir, `server/mix.lock`)

| Package | Version | License |
|---|---|---|
| argon2_elixir | 4.1.3 | Apache-2.0 (bundles the Argon2 reference C code, CC0-1.0 OR Apache-2.0) |
| bandit | 1.15.0 | MIT |
| comeonin | 5.5.1 | BSD-3-Clause |
| db_connection | 2.10.2 | Apache-2.0 |
| decimal | 3.2.0 | Apache-2.0 |
| dns_cluster | 0.2.0 | MIT |
| ecto | 3.14.3 | Apache-2.0 |
| ecto_sql | 3.14.0 | Apache-2.0 |
| elixir_make | 0.10.1 | Apache-2.0 (build tool only) |
| expo | 1.1.1 | Apache-2.0 |
| finch | 0.24.0 | MIT |
| gettext | 1.0.2 | Apache-2.0 |
| hpax | 1.1.0 | Apache-2.0 |
| idna | 8.0.0 | MIT |
| jason | 1.4.5 | Apache-2.0 |
| mime | 2.0.7 | Apache-2.0 |
| mint | 1.11.0 | Apache-2.0 |
| nimble_options | 1.2.0 | Apache-2.0 |
| nimble_pool | 1.2.0 | Apache-2.0 |
| phoenix | 1.8.16 | MIT |
| phoenix_ecto | 4.7.0 | MIT |
| phoenix_pubsub | 2.4.1 | MIT |
| phoenix_template | 1.1.0 | MIT |
| plug | 1.20.4 | Apache-2.0 |
| plug_crypto | 2.2.1 | Apache-2.0 |
| postgrex | 0.22.4 | Apache-2.0 |
| req | 0.7.5 | Apache-2.0 |
| swoosh | 1.30.0 | MIT |
| telemetry | 1.4.3 | Apache-2.0 |
| telemetry_metrics | 1.2.0 | Apache-2.0 |
| telemetry_poller | 1.3.0 | Apache-2.0 |
| thousand_island | 1.6.0 | MIT |
| websock | 0.5.3 | MIT |
| websock_adapter | 0.7.2 | MIT |

## Client runtime (npm, shipped in the web bundle)

| Package | Version | License |
|---|---|---|
| @bufbuild/protobuf | 1.10.1 | Apache-2.0 AND BSD-3-Clause |
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @livekit/components-core | 0.12.16 | Apache-2.0 |
| @livekit/components-react | 2.9.25 | Apache-2.0 |
| @livekit/mutex | 1.1.1 | Apache-2.0 |
| @livekit/protocol | 1.53.0 | Apache-2.0 |
| clsx | 2.1.1 | MIT |
| events | 3.3.0 | MIT |
| jose | 6.2.17 | MIT |
| livekit-client | 2.24.1 | Apache-2.0 |
| lodash.debounce | 4.0.8 | MIT |
| loglevel | 1.9.2 | MIT |
| machina | 7.0.1 | MIT |
| phoenix (channels client) | 1.8.16 | MIT |
| react | 19.3.1 | MIT |
| react-dom | 19.3.1 | MIT |
| rxjs | 7.8.2 | Apache-2.0 |
| scheduler | 0.28.0 | MIT |
| sdp | 3.2.3 | MIT |
| sdp-transform | 2.15.0 | MIT |
| tslib | 2.8.1, 2.9.1 | 0BSD |
| typed-emitter | 2.1.0 | MIT |
| usehooks-ts | 3.1.1 | MIT |
| webrtc-adapter | 9.0.6 | BSD-3-Clause |

Not used: `@livekit/krisp-noise-filter` is an optional, proprietary LiveKit package
and must not be added.

Development-only tools (Vite, Vitest, TypeScript, oxlint, Prettier, Testing Library)
are not shipped to users.

## Services used, not distributed

| Software | License |
|---|---|
| LiveKit server | Apache-2.0 |
| PostgreSQL | PostgreSQL License |
