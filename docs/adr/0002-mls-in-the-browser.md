# ADR 0002: MLS in the browser feeds LiveKit E2EE (phase 1.5 spike)

- Status: accepted
- Date: 2026-11-17

## Context

ADR 0001 requires voice to be end-to-end encrypted with keys created on clients via MLS,
so that the server can never hear calls. The riskiest unknown was whether an MLS
implementation runs in the browser and can hand its keys to LiveKit's E2EE.

## Experiment

Throwaway code in `spikes/e2ee/`:

- `mls-wasm/`: a Rust crate on openmls 0.9.2 (ciphersuite
  `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`), compiled with wasm-pack. One member
  creates a group, adds a second member from its key package and sends a Welcome. Both
  derive a 32-byte voice key with the MLS exporter (`export_secret`, label
  `nosilence voice key`).
- `web/`: a page with three roles. MLS messages travel over LiveKit data messages.
  The derived key goes to `ExternalE2EEKeyProvider.setKey(ArrayBuffer)` (HKDF), then
  `room.setE2EEEnabled(true)`. An outsider uses a random key.
- Each role sends a pure tone (440 / 660 / 880 Hz) instead of the microphone and every
  page analyses what it receives, so the result does not depend on listening.
  (A first attempt with microphones was inconclusive: one person, one microphone and
  three tabs playing at once cannot tell whose audio is heard.)

## Results (Chrome and Edge, Windows 10, local LiveKit 1.13.11)

| Page | From | Received |
|---|---|---|
| alfa (key 61a2191a) | bravo | clear 660 Hz tone, -28 dB |
| alfa | charlie | silence, -∞ dB |
| bravo (key 61a2191a) | alfa | clear 440 Hz tone, -28 dB |
| bravo | charlie | silence, -∞ dB |
| charlie (key d06471b7) | alfa, bravo | silence, -∞ dB |

- Group members derive the same key; an outsider cannot decrypt and gets silence:
  LiveKit drops frames it cannot decrypt instead of passing noise.
- Native tests: two members derive the same key, an outsider does not, and adding a
  member moves the group to a new epoch with a new key.
- MLS module start-up: 9-19 ms. Size: 1.34 MB raw, 486 kB gzip, 369 kB brotli.

## Decision

Keep the plan: Phase 5 uses openmls compiled to WebAssembly, the MLS exporter for media
keys, and LiveKit E2EE with an external key provider. The same module is expected to run
in Tauri's WebView2; that is checked in Phase 6.

## Consequences and open points for Phase 5

- **Support level:** openmls lists `wasm32-unknown-unknown` as "built on CI, not tested".
  We must run our own MLS tests against the wasm build in CI.
- **Build detail:** openmls's `js` feature covers getrandom 0.4; getrandom 0.2 (pulled in
  through `rand_core` 0.6) needs its own `js` feature.
- **Delivery service:** MLS needs commits to be applied in one agreed order. The backend
  must sequence MLS handshake messages per room (it relays them without being able to
  read keys) and store key packages.
- **Membership is authorised by the server, verified by clients:** the spike adds anyone
  who sends a key package. In the product the server decides who may join a voice channel,
  and clients check that credentials belong to those accounts.
- **Key rotation without gaps:** on join and leave the epoch changes; use LiveKit key
  indexes so old and new keys overlap briefly and speech is not cut.
- **Size:** about 370-490 kB compressed, loaded only when joining a voice channel
  (like the LiveKit SDK today).
- **Browsers:** test Firefox and Safari (encoded transform support) before release.
- **Licences:** openmls and its providers are MIT; they will be added to
  THIRD-PARTY-NOTICES when the code moves out of `spikes/` in Phase 5.
