# ADR 0011: Network measurement, LiveKit webhooks and anonymous metrics

- Status: accepted
- Date: 2026-11-23

## Context

Phase 7b measures the four performance targets set in phase 0 (join < 2 s, mouth-to-ear
p95 < 150 ms, reconnect < 3 s, intelligible speech at 10% packet loss), adds LiveKit
webhooks as a second source for voice presence, and anonymous aggregate metrics.

## Decision

**Measuring (options 2A and 3A).** `tools/netlab` runs on demand, not in CI (shared CI
machines give noisy timings). Two Chrome instances join one end-to-end encrypted
channel. The sender's microphone is a file of 30 ms ticks every 300 ms; both pages
note when each tick is captured and when it is heard, on the same machine clock, so
the delay covers the real path (capture, Opus, E2EE, LiveKit, jitter buffer, decoding).
Microphone and speaker hardware add roughly 20-40 ms on top and are not included.
`--listen` records spoken sentences for a listening test.

**Degrading the network: netem on the LiveKit container (option 1C).** Burak first
chose Chrome's built-in WebRTC network emulation (option 1A), but release builds of
Chrome ignore those field trials: the "10% loss" runs measured 0% loss, so their results
were discarded. netem in a short-lived helper container that shares the LiveKit
container's network needs no Windows administrator rights and affects only server to
client traffic; it is cleared after each scenario.

**LiveKit webhooks (option 5A).** LiveKit posts join and leave events to
`/api/livekit/webhook`, signed with a JWT over the SHA-256 of the raw body; anything
else is refused. A participant without an MLS session in the room's group 10 seconds
after joining is removed (someone with a valid LiveKit token but no key can hear
nothing, and now cannot stay either). Leaving LiveKit without an MLS session clears the
user's voice presence even if their gateway connection is up. LiveKit's configuration
moved into `infra/docker-compose.yml` so it can use the API key from `.env`.

**Anonymous metrics (option 4A).** `Nosilence.Metrics` keeps only daily totals
(voice joins, messages, sign-ins, connections, call reports, reconnects) and, for
measured values, counts per value range, enough for a median and p95. Clients send one
call quality summary at the end of a call (join time, round trip, loss, concealment,
duration, reconnects); the server stores no user, channel or community id and deletes
rows after 30 days. `mix nosilence.metrics` prints a summary.

## Results (2026-11-23, local stack, Chrome, end-to-end encrypted)

| Target | Measured | |
|---|---|---|
| Join < 2 s | 1.0 s clean; 1.6-1.7 s with 10-20% loss | met |
| Mouth-to-ear p95 < 150 ms | 40-61 ms clean; 59 ms at 10% loss; 150 ms with 60 ms ± 15 ms extra network delay and 10% loss | met (hardware adds 20-40 ms) |
| Reconnect < 3 s | signal reconnect p95 0.3 s; full reconnect p95 2.36 s over 10 runs (half about 0.28 s, half 2.1-2.4 s) | met, small margin |
| Intelligible at 10% loss | every tick heard; 7-12% of audio concealed; listening test: intelligible (Burak) | met |

At 20% loss speech becomes hard to follow and sounds mechanical (Burak, listening test).
LiveKit turns off redundant audio (RED) when E2EE is on (`disableRed: isE2EEEnabled`),
so audio lost between the server and a listener is concealed, not recovered. The first
listening recordings crackled; the cause was the recorder (a main-thread
ScriptProcessor dropping blocks on 128/256-sample boundaries), not the audio path.
Recording now runs in an AudioWorklet.

## Consequences

- Loss protection that works with E2EE (our own redundancy inside the encrypted frame),
  the two-speed full reconnect, and running netlab on a schedule are on the deferred
  list.
- Production LiveKit needs the webhook URL of the production backend (phase 8).
