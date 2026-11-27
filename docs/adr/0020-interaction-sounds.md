# ADR 0020: Interaction sounds

- Status: accepted
- Date: 2026-11-27

## Context

Burak asked for sounds when something happens (someone joins the channel, the microphone
is turned off, …), original and with character. A listening prototype
(`docs/design/sounds-prototype.html`) offered three characters (glass, drops, wood);
Burak chose glass, asked for it softer and more characterful, and then chose the
"signature" version (A2) of the two refined ones.

## Decision

**Synthesised, not recorded.** Every sound is made by code with the Web Audio API
(`client/src/sounds/engine.ts`): no recordings, no sound packs, so they are ours alone,
need no licence and add a few kilobytes. Soft glass notes: two slightly detuned sine
voices with gentle harmonic overtones, a slow attack (no click), the highs rolled off, a
small generated room. Notes come from a pentatonic scale so sounds that overlap still
agree.

**Character.** A three-note motif, E–G–C ("no-si-lence"): joining plays it upwards,
leaving downwards, someone joining or leaving plays its last two notes, a dropped
connection breaks it off, a restored one completes it. The microphone and hearing close
and open: turning them off muffles the tone (a low-pass filter closing), turning them on
opens it.

**When (2B).** Voice: joining (once the call is encrypted), leaving, others joining or
leaving (the call's encryption group: the people who can actually hear you), mute and
deafen, connection lost and back. Push-to-talk makes no sound. Messages: direct messages
and mentions only, while the app is in front and that conversation or channel is not on
screen (in the background the system notification speaks), at the user's levels
(ADR 0018), never from blocked people, never in do not disturb. While deafened nothing
from others plays; the user's own actions still do.

**Settings (3B).** Settings → Notifications → Sounds: a volume with a sample, and two
switches (voice channel sounds, message sounds), kept on the device.

## Consequences

- `sounds/engine.ts` (the sounds), `sounds/sounds.ts` (when they play, the settings);
  small listeners on the call, its status and the switches (`onCallChange`,
  `onCallStatus`, `onControlsChange`).
- Browsers start audio only after the page has been used; every sound follows a user
  action or comes after one, so this does not get in the way.
