# ADR 0001: Stack and guiding principles

- Status: accepted
- Date: 2026-11-17

## Context

Nosilence is a voice chat app for small communities. The core promise is that nobody
outside a conversation can access what is said in it, without giving up speed.
It starts small (rooms of up to 8 people) and must be able to grow.

## Decision

| Concern | Choice | Why |
|---|---|---|
| Media | LiveKit SFU | Proven, open source, supports E2EE; building our own SFU would take months and add security risk |
| Backend | Elixir / Phoenix | Many concurrent connections and fault isolation are built into the BEAM |
| Database | PostgreSQL | Reliable default; revisit only at a much larger scale |
| Client | React, web and Tauri | One codebase for the browser and a small, secure Windows app |
| Voice encryption | E2EE from the first release; keys created on clients with MLS | The server must never be able to hear calls |
| Text encryption | Transport + access control + disk encryption first; E2EE in a later phase with an E2EE-ready schema | Text E2EE costs (search, multi-device, history) would delay the MVP |
| Visibility | Conversations are never made public or indexed | Direct consequence of the core promise |
| License | AGPL-3.0-only | Verifiable security claims; prevents closed competing services |

Principles taken from larger voice platforms, not their stacks: the right language for
each job, voice separated from chat, encryption built on a standard (MLS).

## Consequences

- The gateway is its own context so it can be replaced later without touching the rest.
- Limits (room capacity, minimum age, retention) are configuration.
- The web client loads code from the server on every visit, so it is weaker than the
  signed desktop app against a compromised server; users are told this openly.
- Phase 1.5 must confirm that MLS (openmls compiled to WebAssembly) can feed keys to
  LiveKit E2EE in the browser before more is built on it.
