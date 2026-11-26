# netlab

Measures Nosilence voice against the phase 7 targets (ADR 0011):

| Target | How it is measured |
|---|---|
| Join < 2 s | From pressing Join to hearing the first sound from the other person |
| Mouth-to-ear p95 < 150 ms | The sender's microphone plays a tick every 300 ms; both pages note when each tick is captured and when it is heard, on the same machine clock. Microphone and speaker hardware add roughly 20-40 ms on top. |
| Reconnect < 3 s | LiveKit drops and rebuilds the receiver's connection (`signal-reconnect`, `full-reconnect`); time until ticks are heard again (includes up to one tick spacing) |
| Intelligible at 10% loss | Ticks still heard, share of audio the browser had to invent (concealed), and a listening test (`--listen`) |

Two Chrome instances join one end-to-end encrypted voice channel. The network is
degraded with Linux `netem` on the LiveKit container: a short-lived helper
container (`alpine` with `iproute2-tc`) shares its network namespace and needs
`NET_ADMIN`; no Windows administrator rights are needed, and the setting is
cleared when a scenario ends. Chrome's own WebRTC network emulation field trials
are ignored by release builds and cannot be used.

## Run

Start the development stack first (Docker services, `mix phx.server`, `npm run dev`
in `client/`). Then:

```powershell
cd tools/netlab
npm install
npm run measure              # the four targets, about 3 minutes
node netlab.mjs --listen     # recordings/*.wav, with loss and concealed audio per scenario
node netlab.mjs --ptt        # push-to-talk: silent until Ctrl + Shift is held
node netlab.mjs --mute       # the Mute button: silent while muted
node netlab.mjs --rejoin     # leave and join again 3 times (--rejoin-who first: the group's founder)
node netlab.mjs --stay       # the call goes on while the listener opens other pages
node netlab.mjs --social     # friends and a direct message, with the unread badge
node netlab.mjs --settings-shot  # recordings/settings.png, the voice settings page
```

Options: `--app http://127.0.0.1:5173`, `--api http://127.0.0.1:4000`,
`--chrome "<path to chrome.exe>"`, `--livekit-container nosilence-livekit-1`, `--headful`,
`--only "clean,10% loss"` (scenarios by label), `--trace` (room events during reconnects).

Scenarios degrade the server-to-listener direction with netem, except
`10% uplink loss` / `uplink-loss-10`, which drops packets the clients send to the
server (iptables), as a poor sender connection would. Opus FEC protects speech, not
ticks: judge loss protection by the listening test's "concealed" share (ADR 0013).
A reconnect run only counts when LiveKit really reconnected.

The listening test speaks Harvard sentences (IEEE 1969) with Windows text-to-speech
and records what the receiver hears. Recordings stay local (`recordings/` is ignored
by Git).
