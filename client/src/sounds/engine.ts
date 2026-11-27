// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Interaction sounds (ADR 0020), synthesised with the Web Audio API: no
 * recordings and no sound packs. Burak chose the "signature" set (A2 in
 * docs/design/sounds-prototype.html): soft glass tones an octave low, with a
 * three-note motif (E-G-C, "no-si-lence") and a tone that closes (muffles)
 * when the microphone or hearing is turned off and opens when turned on.
 */

export type SoundName =
  | 'join'
  | 'leave'
  | 'otherJoin'
  | 'otherLeave'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'
  | 'lost'
  | 'back'
  | 'message'
  | 'mention'

let ctx: AudioContext | undefined
let master: GainNode | undefined
let room: GainNode | undefined

// A small room: decaying noise as the impulse response, made here.
function makeRoom(c: AudioContext, seconds = 1.6) {
  const length = Math.ceil(c.sampleRate * seconds)
  const impulse = c.createBuffer(2, length, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    for (let i = 0; i < length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2)
  }
  const conv = c.createConvolver()
  conv.buffer = impulse
  return conv
}

function audio(volume: number): AudioContext | undefined {
  if (typeof AudioContext === 'undefined') return undefined
  if (!ctx) {
    ctx = new AudioContext()
    master = ctx.createGain()
    // A gentle limiter so stacked notes never clip.
    const limit = ctx.createDynamicsCompressor()
    limit.threshold.value = -12
    limit.ratio.value = 6
    master.connect(limit).connect(ctx.destination)
    room = ctx.createGain()
    room.gain.value = 0.32
    room.connect(makeRoom(ctx)).connect(master)
  }
  // Browsers start audio suspended until the page has been used.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  master!.gain.value = volume
  return ctx
}

type Note = {
  at?: number
  freq: number
  to?: number
  glide?: number
  dur?: number
  gain?: number
  filter?: number
  filterTo?: number
  sweep?: number
}

/**
 * One soft glass note: two slightly detuned sine voices with gentle harmonic
 * overtones, a slow attack (no click), the highs rolled off, a little room.
 * `filter`/`filterTo` close or open the tone over `sweep` seconds.
 */
function soft(c: AudioContext, n: Note) {
  const {
    at = 0,
    freq,
    to,
    glide = 0.05,
    dur = 1.3,
    gain = 0.24,
    filter = 2600,
    filterTo,
    sweep = 0.22,
  } = n
  const t = c.currentTime + 0.02 + at
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.Q.value = 0.7
  lp.frequency.setValueAtTime(filter, t)
  if (filterTo) lp.frequency.exponentialRampToValueAtTime(filterTo, t + sweep)
  const env = c.createGain()
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(gain, t + 0.022)
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  lp.connect(env)
  env.connect(master!)
  const send = c.createGain()
  send.gain.value = 0.35
  env.connect(send).connect(room!)
  for (const cents of [-4, 4])
    for (const [ratio, level] of [
      [1, 1],
      [2, 0.14],
      [3, 0.04],
    ]) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.detune.value = cents
      o.frequency.setValueAtTime(freq * ratio, t)
      if (to) o.frequency.exponentialRampToValueAtTime(to * ratio, t + glide)
      g.gain.value = level / 2
      o.connect(g).connect(lp)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
}

// Notes (Hz) of a pentatonic scale, so any two of them sound well together.
const N = { G4: 392, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, G6: 1567.98 }
// The signature: E-G-C.
const SIG = [N.E5, N.G5, N.C6]

const closing = (n: Note): Note => ({ filter: 2600, filterTo: 380, dur: 0.6, ...n })
const opening = (n: Note): Note => ({ filter: 380, filterTo: 2800, dur: 0.7, ...n })

const SOUNDS: Record<SoundName, Note[]> = {
  join: SIG.map((freq, i) => ({ at: i * 0.1, freq, gain: 0.2 })),
  leave: [...SIG].reverse().map((freq, i) => ({ at: i * 0.1, freq, gain: 0.17 })),
  otherJoin: [
    { freq: SIG[1], gain: 0.16, dur: 0.9 },
    { at: 0.1, freq: SIG[2], gain: 0.16 },
  ],
  otherLeave: [
    { freq: SIG[2], gain: 0.14, dur: 0.9 },
    { at: 0.1, freq: SIG[1], gain: 0.14 },
  ],
  mute: [closing({ freq: N.G4, gain: 0.26 })],
  unmute: [opening({ freq: N.G4, gain: 0.26 })],
  deafen: [
    closing({ freq: N.C5, gain: 0.22 }),
    closing({ at: 0.09, freq: N.G4, gain: 0.22, dur: 0.8 }),
  ],
  undeafen: [
    opening({ freq: N.G4, gain: 0.22 }),
    opening({ at: 0.09, freq: N.C5, gain: 0.22, dur: 0.9 }),
  ],
  // The motif breaks off and sags.
  lost: [
    { freq: SIG[0], gain: 0.18 },
    { at: 0.12, freq: SIG[1], gain: 0.18 },
    { at: 0.26, freq: SIG[1], to: N.D5, glide: 0.4, dur: 1.1, gain: 0.16 },
  ],
  // The motif completes, with a glint above.
  back: [
    ...SIG.map((freq, i) => ({ at: i * 0.09, freq, gain: 0.18 })),
    { at: 0.3, freq: N.G6, gain: 0.08, dur: 1.2 },
  ],
  message: [{ freq: SIG[1], gain: 0.15, dur: 0.9 }],
  mention: [
    { freq: SIG[1], gain: 0.18 },
    { at: 0.12, freq: SIG[2], gain: 0.18, dur: 1.1 },
  ],
}

/** Plays a sound at `volume` (0 to 1). Does nothing where audio is unavailable. */
export function synthesize(name: SoundName, volume: number) {
  if (volume <= 0) return
  const c = audio(volume)
  if (!c) return
  for (const n of SOUNDS[name]) soft(c, n)
}
