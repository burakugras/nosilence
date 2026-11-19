# Nosilence server

Elixir / Phoenix backend (API and, later, the real-time gateway).

PostgreSQL runs in Docker (see `../infra`). Database credentials are read from
`../infra/.env`; real environment variables take precedence (used in CI).

```powershell
mix setup            # deps, database, migrations
mix phx.server       # http://127.0.0.1:4000
mix test
mix precommit        # compile with warnings as errors, format, test
```

Account emails (confirmation, password reset) land in the local mailbox at
http://127.0.0.1:4000/dev/mailbox during development.

On Windows, `argon2_elixir` contains C code. When it has to be compiled (first setup,
new version, `mix deps.clean`), run the command inside the MSVC build environment:

```powershell
.\scripts\with-msvc.ps1 mix deps.compile
```

Agent guidance for this Phoenix project lives in `AGENTS.md`.
