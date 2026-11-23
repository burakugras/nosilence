# ADR 0013: Loss protection, faster reconnects, devices and push-to-talk

- Status: accepted
- Date: 2026-11-23

## Context

Phase 7b measured that end-to-end encrypted calls stay intelligible at 10% packet
loss, but the browser had to invent (conceal) almost as much audio as was lost:
LiveKit turns off redundant audio (RED) when E2EE is on, because RED wraps the frames
in a form the SFU has to read. Full reconnects took about 2.3 s. Users could not pick
their microphone or speaker, see their input level, or use push-to-talk.

## Decision

**Loss protection: Opus in-band FEC, with the listener's loss reported to the speaker
(option B).** Opus can carry a low-bitrate copy of the previous frame inside each
packet (FEC); it lives inside the encrypted payload, so it works with E2EE. The
speaker's encoder only adds it when RTCP says packets are being lost. Measured with
speech (`tools/netlab --listen`):

| Where the 10% loss is | Concealed before | Concealed after |
| --- | --- | --- |
| Speaker to server | 1.7% (FEC already worked) | 1.6% |
| Server to listener | 7.4% | 1.8% |

The second row was the problem: the server's reports to the speaker only described
the speaker's own link, so the encoder never heard about losses on the listener's
side. LiveKit has `audio.enable_loss_proxying` for exactly this (the weakest
listener's loss goes into the reports to the speaker), but in 1.13.11 the setting is
never applied to the receive buffers. `infra/livekit/` builds LiveKit 1.13.11 with a
three-line patch that applies it, and the configuration turns it on. The fix is to be
offered upstream; the image is removed once LiveKit ships it.

Rejected: audio NACK (retransmission). It is negotiated only when the server makes the
offer (`singlePeerConnection: false`; Chrome does not offer audio NACK itself) and cut
concealment to about 2%, but the listener's jitter buffer then waits for
retransmissions: mouth-to-ear p95 at 10% loss rose from about 60 ms to about 250 ms.
In conversation, delay hurts more than a little concealment. RED inside the encrypted
frame was not attempted: the browser does not let a page insert a frame for a packet
that never arrived.

FEC only repairs single lost packets and protects speech (Opus SILK), not tones; the
tick test in netlab therefore still shows about 5-9% concealed at 10% loss, and the
speech test is the measure.

**Faster full reconnect.** The "two speeds" seen in phase 7b were a measuring error:
`simulateScenario` sometimes does nothing, and the next tick looked like a fast
reconnect. netlab now counts a run only when LiveKit really reconnected, and waits for
sound after the reconnect started. A real full reconnect always took about 2.3 s, of
which 2 s is a fixed wait in livekit-client (`waitForPCReconnected`, marked FIXME
there) before it checks the new connection. A full reconnect creates new peer
connections, so there is no stale state to wait out; `client/patches/` (applied by
patch-package after `npm install`) skips the wait on that path only, and the resume
path keeps it. Full reconnect p95: 2.4 s to about 0.6-0.9 s. `livekit-client` is
pinned to the exact version the patch was made for; the patch is to be offered
upstream too.

**Devices and input level (option A).** A voice settings panel on its own page
(`/settings`) and inside a call: microphone, speaker (where the browser can choose
one: not in Safari), a level meter, and a microphone test before joining. The
settings belong to the device, so they live in `localStorage`, not the account. In a
call the meter shows the microphone actually being sent.

**Push-to-talk (Burak: Ctrl + Shift by default, polled).** Two ways to talk: voice
activity (as before) or push-to-talk, with up to three keys of the user's choice
(modifiers, letters, digits, F1-F12, Space, mouse side buttons). In push-to-talk the
microphone is published muted and opens only while all keys are held. The client
publishes the microphone itself instead of letting the LiveKit component do it, so
nothing is sent before the first press.

- In the browser it works while the tab is focused (browsers do not tell pages about
  keys otherwise).
- The desktop app polls the state of the chosen keys 50 times a second
  (`GetAsyncKeyState`, `desktop/src/ptt.rs`) and only sends "held" or "released" to
  the page. A registered Windows hotkey cannot be modifiers only and takes the key
  from other apps; a low-level keyboard hook sees every key and antivirus may treat
  the app as a key logger. Polling sees only the chosen keys, and they keep working
  in other apps.

Holding the keys together with others (Ctrl + Shift + T) also talks, and Ctrl + Shift
can switch the keyboard layout if Windows is set up that way; the user can choose
other keys.

**Rejoining (found while testing).** Whoever joined from a Welcome made Welcomes
without the ratchet tree (`MlsGroupJoinConfig::default()`), so when the group's
founder left and was added back by someone else, joining failed with
`MissingRatchetTree` and the call ended "could not be encrypted". Joined members now
use the same setting as the founder; a test covers it, and `netlab --rejoin` checks
leaving and joining again in a real browser.

## Consequences

- Development runs our own LiveKit image (`docker compose up -d` builds it, which needs
  network access to GitHub the first time). Production needs either that image or a
  LiveKit release with the fix (phase 12).
- Two local patches to dependencies must be checked on every LiveKit update; the
  build fails loudly (`patch-package`, `git apply`) if one no longer applies.
- Push-to-talk on the web only works in the focused tab.
