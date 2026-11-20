# ADR 0007: Voice end-to-end encryption with MLS

- Status: accepted
- Date: 2026-11-20

## Context

Phase 5 makes voice end-to-end encrypted: only the people in a call can hear it, not
the media server (LiveKit) and not our backend. ADR 0002 showed that openmls compiled
to WebAssembly can feed LiveKit's E2EE in the browser.

## Decision

**Keys are made on devices with MLS.** `client/mls` (Rust, openmls 0.9.2, ciphersuite
`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`) is compiled to WebAssembly and loaded
only with the voice code. Every device creates fresh signing and HPKE keys for each call
and stores nothing (option 2B). The MLS identity is the account id. Each epoch's 32-byte
voice key comes from the MLS exporter (label `nosilence voice key`) and goes to LiveKit
through `MlsKeyProvider` in key ring slot `epoch mod 16`.

**The server orders, it cannot read (option 1A).** `Nosilence.Voice.Group`, one process
per voice channel in use, is the MLS delivery service. Devices reach it over the gateway
topic `voice:<channel_id>` (members of the channel's community only). The first device
creates the group; each later change, a join or a leave, is handed to one member still
in the group, the committer. A commit is accepted only for the current epoch, so the
group cannot split; accepted commits go to the other members and the new member gets
its Welcome. Key packages, commits and Welcomes are opaque bytes to the server, with size
limits.

**Leaving changes the key, however someone leaves (option 3A).** When a device's
connection ends (Leave, closed tab, lost network, removal from the community, community
deleted) a remaining member removes it from the group. If the committer does not answer
within 3 seconds the next member is asked. When no member is left, a waiting device
starts a new group.

**Fail closed (option 4A).** The browser connects to LiveKit, and so publishes the
microphone, only after it holds a key. Without E2EE support, or if securing fails, the
user cannot join. A device whose state disagrees with the server starts over with fresh
keys; after three restarts in 30 seconds it gives up and disconnects.

**People can check for a hidden listener.** The call shows who the key is shared with
(from the MLS group, not from the server) and a 30-digit verification code from the MLS
epoch authenticator. Everyone in the same epoch sees the same code; comparing it out of
band detects a member the server slipped in. The code changes on every join and leave.

**Checks.** Rust tests: shared key and code, a leaver cannot follow the new key, joiners
cannot read the past, wrong-account key packages and foreign Welcomes are refused, a
refused commit is discarded. Client tests run the session logic with the real
WebAssembly module. Server tests cover ordering, failover, restarts and losing access.
A browser run (Chrome, local LiveKit) measured: secured in about 0.9 s from Join; a
participant with a valid LiveKit token but not in the group received packets and no
sound; every frame the server forwarded (555 of 555) carried the E2EE trailer; after a
leave the key changed in about 40 ms and the remaining two kept hearing each other.

## Consequences

- Building the client needs Rust and wasm-pack (`npm run build:mls`); CI builds it and runs
  the Rust checks.
- The media server still sees metadata: who is in a call, packet sizes and timing, and
  the audio level header that drives the speaking indicator, so it can tell who talks
  when. Content stays encrypted. Hiding this is deferred. This corrects ADR 0006, which
  said the server never learns who spoke when: true for our backend, not for LiveKit.
- Persistent device keys and verifying people across calls (option 2C) are deferred.
- The same module must run in the desktop app's WebView2 (phase 6).
