# ADR 0003: Accounts and sessions

- Status: accepted
- Date: 2026-11-19

## Context

Phase 2 adds accounts: sign-up with email and password (Google sign-in follows in
phase 2b), email confirmation, password reset and an 18+ requirement. Voice tokens must
only go to signed-in users. Security comes first; the same API will later serve the
Tauri desktop app.

## Decision

**Passwords: Argon2id** (`argon2_elixir`, 64 MiB memory, 3 iterations, 4 lanes).
Rejected bcrypt (no memory hardness) and PBKDF2 (cheap to brute-force on GPUs).
Minimum length 12, maximum 256; no composition rules.

**Sessions: random tokens stored as SHA-256 hashes in the database**, valid for 60 days.
Rejected stateless JWT sessions: they cannot be revoked before they expire. Database
tokens make "sign out" and "sign out everywhere" (done on password reset) immediate, and
a stolen database contains no usable session.

**Web transport: HttpOnly, `SameSite=Lax` cookie** (`Secure` in production), so page
scripts cannot read the token. **CSRF**: state-changing requests must be
`application/json`; a cross-site HTML form cannot send that without a CORS preflight,
which we never allow. The desktop app gets a bearer-token path in phase 6.

**Email links** (confirmation 7 days, password reset 1 hour) use the same hashed tokens,
work once, and are only valid while the account email equals the address they were sent to.

**Sign-in requires a confirmed email.** Answers never reveal whether an email is
registered: the same 401 for unknown email and wrong password (with a dummy Argon2 check to
equalise timing), and the same 202 for password reset and resend requests.

**Age: we store when the user confirmed being 18+, not a birth date** (data minimisation).
Verification through e-Devlet is planned before the public launch (phase 8).

**Voice tokens** use the account id as LiveKit identity and the stored display name;
nothing about identity comes from the request. The unauthenticated phase 1 endpoint
is removed.

## Consequences

- Native code on Windows: `argon2_elixir` compiles with MSVC; `server/scripts/with-msvc.ps1`
  loads the build environment when a native dependency needs compiling.
- Dependency advisories are now checked in CI (`mix hex.audit`, `npm audit`). Adding them
  surfaced two advisories (plug, idna), fixed by upgrading before this phase was merged.
- Still open: rate limiting sign-in and email endpoints, and a scheduled job for
  `Accounts.delete_expired_tokens/0`. Both belong to phase 7 (retention jobs) and the
  security review in phase 8; Argon2's cost slows online guessing until then.
- Emails in development go to the local mailbox (`/dev/mailbox`); a production email
  provider is chosen with hosting in phase 8.
