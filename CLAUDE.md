# Nosilence: agent guide

Voice chat app. Read [README.md](README.md) for goals and stack.

## Ground rules

- Security first: never log message or audio content; never add public pages,
  search-engine indexing or analytics that expose conversations.
- Voice is end-to-end encrypted (LiveKit E2EE, keys created on clients via MLS).
  Never let the server generate or see media keys.
- Keep limits configurable, not hard-coded: room capacity (default 8),
  minimum age (default 18), log retention (traffic logs 1 year, other metadata 30 days).
- One React client builds for web and for Tauri. Desktop-only features go behind
  a platform layer.
- License is AGPL-3.0. Check every new dependency's license is compatible and
  record it in THIRD-PARTY-NOTICES.
- Development on Windows 10: Elixir and Tauri run natively; PostgreSQL and LiveKit
  run in Docker. Shell commands for the user must work in Windows PowerShell 5.1.

## Layout

```
server/    Elixir/Phoenix backend
client/    React UI
desktop/   Tauri shell
infra/     Docker (PostgreSQL, LiveKit)
```

Maintainer-specific context lives in `CLAUDE.local.md` (not committed).
