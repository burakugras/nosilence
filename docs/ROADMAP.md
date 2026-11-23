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
Tauri shell and platform layer, system tray, Windows installer. Global push-to-talk was
moved to the deferred list (the method is not decided yet).
**Done:** the installed Windows app talks in the same room as a web user.

### Phase 7: Robustness and compliance (M)
In two parts. **7a, security and data:** rate limits, the legally required traffic log,
automatic retention jobs (30 days / 1 year), account deletion and data export, a Rust
dependency audit. **7b, networks and measurement:** reconnect and packet-loss tests under
emulated bad networks, p95 latency measurement, anonymous aggregate metrics, LiveKit
webhooks for voice presence.
**Done:** all four performance targets are measured and met:
mouth-to-ear p95 < 150 ms, join < 2 s, reconnect < 3 s, intelligible speech at 10% packet loss.

Burak decided on 2026-11-23 that renting servers and the legal review come last: they
mean releasing the app. Development phases 8 to 11 come first.

### Phase 8: Community management (M)
Transferring ownership (also when deleting an account), a moderator role, renaming,
deleting and ordering channels, editing messages.
**Done:** a community can be run without its owner doing everything, and handed over.

### Phase 9: Voice quality and control (M)
Loss protection that works with E2EE, the two-speed full reconnect, push-to-talk,
choosing microphone and speaker, input level.
**Done:** speech stays clear at 10% loss without guessing most lost audio; the chosen
devices and push-to-talk work on web and desktop.

### Phase 10: Desktop maturity (M)
First Google sign-up inside the app, automatic updates from GitHub Releases (signed),
desktop notifications.
**Done:** a new version reaches an installed app without reinstalling by hand.

### Phase 11: Social features (L)
Direct and group messages, friends, profile picture and status, mentions and reactions.
**Done:** people can find each other and talk outside communities.

### Phase 12: Release (M)
Server hosting, HTTPS, TURN, backups, legal texts with legal review, in-app
"Source code" link (AGPL), security review, code signing, production addresses.
**Done:** a closed test with real users has taken place.

## After the MVP
End-to-end encrypted text messages, video and screen sharing, richer roles, mobile apps.

## Deferred

Postponed on purpose. Reviewed at the start of every phase.

| Item | Decided in | Target |
| --- | --- | --- |
| Persistent device keys and verifying people across calls | Phase 5 | After the MVP |
| Hiding who speaks when from the media server (audio level header, packet timing) | Phase 5 | After the MVP |
| Code signing for the Windows installer (SmartScreen warning until then) | Phase 6 | Phase 12 |
| Production server address in `client/.env.desktop` and the desktop CSP | Phase 6 | Phase 12 |
| Automatic updates for the desktop app: Tauri updater with a signed update (key kept by Burak, copy in GitHub Secrets), releases on GitHub, check on start and a "Check for updates" button | Phase 6 | Phase 10 |
| Finishing a first Google sign-up inside the desktop app (done in the browser for now) | Phase 6 | Phase 10 |
| macOS app: check WebKit (WKWebView) with microphone and E2EE first | Phase 6 | After the MVP |
| Disk encryption for the database and backups | Phase 4 | Phase 12 |
| Legal review of retention periods (traffic logs 1 year, metadata 30 days) | Phase 0 | Phase 12 |
| Hosting choice (VPS) | Phase 0 | Phase 12 |
| Contributor licence agreement before accepting outside contributions | Phase 0 | First outside contribution |
| Whether to move to `AGPL-3.0-or-later` | Phase 0 | When a new AGPL version is published |
| End-to-end encrypted text messages | Phase 0 | After the MVP |
| Behind a reverse proxy, rate limits and traffic records need the real client address (trusted `X-Forwarded-For`) | Phase 7a | Phase 12 |
| Restricted access to traffic records, with every access logged; a way to answer lawful requests | Phase 7a | Phase 12 |
| Re-check ignored Rust advisories (`.cargo/audit.toml`) when openmls or Tauri are updated | Phase 7a | Every dependency update |
| Run tools/netlab on a schedule (nightly) on a dedicated machine | Phase 7b | After the MVP |
| Production webhook URL in the LiveKit configuration | Phase 7b | Phase 12 |
| Offer the LiveKit fixes upstream (audio loss proxying in the server, the 2 s wait in livekit-client); then drop `infra/livekit/` and `client/patches/` | Phase 9 | When LiveKit releases them (production needs the image or a fixed release by Phase 12) |
| Global push-to-talk through a keyboard hook (keys pass through, more buttons) once the installer is signed | Phase 9 | After Phase 12 |
