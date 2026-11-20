# ADR 0009: Rate limits, retention and account rights

- Status: accepted
- Date: 2026-11-20

## Context

Phase 7a closes security and data gaps left open earlier: no limits on sign-in, email
or message requests; expired data was never deleted; the traffic records decided in
phase 0 (IP address, port, time, account; never content; encrypted, one year) were not
written yet; users could not download or delete their data.

## Decision

**Rate limits in memory (option 1A), sliding window with a pause (option B).**
`Nosilence.RateLimit` counts hits per key over the last `window` milliseconds (not
clock-aligned buckets, which let bursts double up at a boundary and sometimes made the
wait only a second or two). Sign-in: 5 per email address and 20 per IP address a minute;
going over blocks for 1 minute, 15 minutes if it happens again within an hour. Messages:
10 per user in 10 seconds; going over pauses sending for 30 seconds, 2 minutes if it
happens again within 5 minutes. Emails: at most 3 per address and 20 email-sending
requests per IP address an hour. Limits are configuration. Over the limit the API
answers 429 with `Retry-After` and a plain message ("You are sending messages too fast.
Try again in 30 seconds."), except for the per-address email limit, where the answer
stays the same and nothing is sent, so responses never reveal whether an account exists.
State is lost on restart and is per server; several servers will need a shared store.

**Traffic records, encrypted in the application (option 2A).** `Nosilence.TrafficLog`
records sign-ins (password, Google on the web and in the desktop app) and gateway
connections: account, event, time, and "IP port" encrypted with AES-256-GCM. The key is
server configuration (`TRAFFIC_LOG_KEY` in production), never stored in the database,
so a dump or backup alone does not reveal addresses; account and event are bound to the
ciphertext. Records have no foreign key and survive account deletion; they are deleted
after `retention_days` (365).

**Nightly clean-up.** `Nosilence.Retention` runs at start and every 24 hours: sessions
after 60 days, confirmation links after 7 days, reset links after 1 hour, desktop sign-in
codes after 2 minutes, invites 30 days after they ended, traffic records after a year.
A plain GenServer is enough for a few idempotent steps; a job queue is not needed yet.

**Account deletion (Burak: option B, the user chooses).** The user types their email
and, for password accounts, their password. The account, sessions and memberships are
deleted; communities they own are deleted with their content, after a warning listing
them (transferring ownership is deferred). Messages in other communities stay, shown as
from "Deleted user", so conversations keep their flow; a checkbox, off by default,
deletes them too. All deleted accounts share one label, so messages cannot be linked
to each other. Live connections end and voice rooms are left at once. Traffic records
are kept for their legal period, which the page says.

**Data export.** "Download my data" serves one JSON file with the account, memberships,
the user's messages, invites they created and their own traffic records (decrypted).

**Rust dependency audit.** CI runs `cargo audit` on `client/mls` and `desktop`. Three
current advisories do not affect us and are listed with reasons in `.cargo/audit.toml`:
P-256 timing issues in `crypto-bigint` (we only use X25519 + Ed25519) and `libcrux-kem`
(an optional dependency we do not compile).

## Consequences

- Retention periods are a legal question; the legal review stays on the phase 8 list.
- Behind a reverse proxy (phase 8) rate limits and traffic records must use the real
  client address from a trusted header.
- Who may read traffic records, and logging every such access, comes with hosting.
