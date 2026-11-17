# Nosilence

Fast, secure voice chat for small communities. Work in progress.

## Goals

- **Private by design:** nobody outside a conversation can access what is said in it.
  Voice calls are end-to-end encrypted from the first release; end-to-end encrypted
  text messages follow in a later phase. Conversations are never made public or indexed.
- **Low latency:** mouth-to-ear latency under 150 ms (p95), joining a room in under
  2 seconds, recovering from short network drops in under 3 seconds.
- **Start small, grow later:** voice rooms of up to 8 people at first, configurable.

## Planned stack

| Part | Technology |
|---|---|
| Media (SFU) | [LiveKit](https://livekit.io) |
| Backend | Elixir / Phoenix |
| Database | PostgreSQL |
| Client | React, shipped as a web app and as a Windows app with [Tauri](https://tauri.app) |
| E2EE key management | MLS (Messaging Layer Security) |

## Repository layout (planned)

```
server/    Elixir/Phoenix backend
client/    React user interface (web build)
desktop/   Tauri shell around the client
infra/     Docker setup for PostgreSQL and LiveKit
```

## Status

Planning is done; implementation is starting. Nothing here is ready for use yet.

## License

Nosilence is licensed under the [GNU Affero General Public License v3.0](LICENSE).
If you run a modified version on a server, you must offer its source code to its users.
