# Nosilence roadmap

Sizes: **S** small, **M** medium, **L** large. No dates: a phase is done when its
"done" criteria are met and its tests pass, not before. The next phase starts only then.

## Working rules

1. **Boundaries.** The backend is split into contexts (Accounts, Communities, Voice,
   Messaging). Contexts call each other only through their public functions.
2. **Definition of done** for every phase, measurable and covered by tests.
3. **Tests from day one.** CI runs on every push; a red build cannot be merged.
4. **Decision records.** Every significant technical decision gets a short ADR in `docs/adr/`.
5. **Small changes.** One feature per branch and pull request, reviewed before merge.
6. **Limits are configuration.** Room capacity, minimum age and retention periods are never hard-coded.
7. **Clean-up at the end of each phase.** Short refactoring pass before moving on.
8. **Nothing deferred is forgotten.** Anything we postpone goes into [Deferred](#deferred)
   with a target. At the start of each phase we review the list and raise what is due.

## Phases

### Phase 0: Foundation (S)
Phoenix skeleton (`server/`), React + Vite + TypeScript (`client/`), GitHub Actions for
tests and formatting, SPDX license headers, ADR folder, THIRD-PARTY-NOTICES.
**Done:** CI is green; `mix test` and `npm test` run.

### Phase 1: Walking skeleton (M)
Thinnest end-to-end slice: the backend issues a LiveKit token, a React page joins a room,
two browser tabs hear each other, mute and unmute work. No accounts yet.
**Done:** two tabs talk; latency is measured for the first time.

### Phase 1.5: E2EE spike (S)
Throwaway experiment: can openmls, compiled to WebAssembly, run in the browser and feed
keys to LiveKit's end-to-end encryption? Outcome recorded in an ADR.
**Done:** a clear yes or no; on "no", the plan changes before more is built.

### Phase 2: Accounts (M)
Email and password sign-up (Argon2), email verification, password reset, Google sign-in,
18+ age confirmation. Cookie sessions on the web, tokens on desktop.
**Done:** sign-up, sign-in, sign-out and reset flows pass their tests.

### Phase 3: Communities and permissions (M)
Create a server, invite links, voice channels, membership and roles (owner, member).
The room capacity limit (default 8) is enforced before a token is issued.
**Done:** tests prove non-members and the ninth participant are rejected.

### Phase 4: Presence and text channels (M)
Phoenix Channels gateway as its own context: who is in a voice channel, who is speaking.
Text messages stored in a schema ready for later E2EE (ciphertext field, device id).
**Done:** two users see each other and messages in real time; clients reconnect.

### Phase 5: Voice E2EE (L)
Keys created on devices with MLS and handed to LiveKit E2EE; keys rotate when a member
leaves; the UI shows when a call is end-to-end encrypted.
**Done:** tests show the server only sees encrypted media and keys rotate on leave.

### Phase 6: Desktop (M)
Tauri shell and platform layer, global push-to-talk, system tray, Windows installer.
**Done:** the installed Windows app talks in the same room as a web user.

### Phase 7: Robustness and compliance (M)
Reconnect and packet-loss tests under emulated bad networks, p95 latency measurement,
anonymous aggregate metrics, automatic retention jobs (30 days / 1 year),
account deletion and data export.
**Done:** all four performance targets are measured and met:
mouth-to-ear p95 < 150 ms, join < 2 s, reconnect < 3 s, intelligible speech at 10% packet loss.

### Phase 8: First external test (M)
Server hosting, HTTPS, TURN, backups, legal texts with legal review, in-app
"Source code" link (AGPL), security review.
**Done:** a closed test with real users has taken place.

## After the MVP
End-to-end encrypted text messages, video and screen sharing, richer roles, mobile apps.

## Deferred

Postponed on purpose. Reviewed at the start of every phase.

| Item | Decided in | Target |
| --- | --- | --- |
| Rate limiting for sign-in and email endpoints | Phase 2 | Phase 7 |
| Scheduled cleanup of expired sessions and email tokens | Phase 2 | Phase 7 |
| Transferring community ownership | Phase 3 | Before Phase 8 |
| Moderator role | Phase 3 | Before Phase 8 |
| Renaming and deleting channels | Phase 3 | Before Phase 8 |
| Editing messages | Phase 4 | Before Phase 8 |
| Rate limiting for sending messages | Phase 4 | Phase 7 |
| Allowing the desktop app's origin on the gateway | Phase 4 | Phase 6 |
| Persistent device keys and verifying people across calls | Phase 5 | After the MVP |
| Hiding who speaks when from the media server (audio level header, packet timing) | Phase 5 | After the MVP |
| Dependency audit for the Rust MLS crate (`cargo audit`) in CI | Phase 5 | Phase 7 |
| LiveKit webhooks as a second source for voice presence | Phase 4 | Phase 7 |
| Disk encryption for the database and backups | Phase 4 | Phase 8 |
| Legal review of retention periods (traffic logs 1 year, metadata 30 days) | Phase 0 | Phase 8 |
| Hosting choice (VPS) | Phase 0 | Phase 8 |
| Contributor licence agreement before accepting outside contributions | Phase 0 | First outside contribution |
| Whether to move to `AGPL-3.0-or-later` | Phase 0 | When a new AGPL version is published |
| End-to-end encrypted text messages | Phase 0 | After the MVP |
