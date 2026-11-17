// SPDX-License-Identifier: AGPL-3.0-only
//
// Phase 1.5 spike (throwaway). Roles:
//   creator  (alfa)    creates the MLS group, adds whoever sends a key package
//   joiner   (bravo)   sends its key package, joins from the Welcome message
//   outsider (charlie) never joins the group and uses a random key
// MLS messages travel over LiveKit data messages. The server relays them but
// cannot derive the voice key: the Welcome is encrypted to the joiner's key package.
import init, { Member } from 'mls-wasm'
import {
  ExternalE2EEKeyProvider,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client'

type Role = 'creator' | 'joiner' | 'outsider'
const NAMES: Record<Role, string> = { creator: 'alfa', joiner: 'bravo', outsider: 'charlie' }
// Each role sends a pure tone instead of the microphone, so a page can tell exactly
// whose audio it decrypts. One person with one microphone cannot test this by ear.
const TONES: Record<string, number> = { alfa: 440, bravo: 660, charlie: 880 }
const SILENCE_DB = -70
const TONE_TOLERANCE_HZ = 15
const ROOM = 'e2ee-spike'
const TOPIC_KEY_PACKAGE = 'mls-key-package'
const TOPIC_WELCOME = 'mls-welcome'

const logEl = document.querySelector<HTMLPreElement>('#log')!
const statusEl = document.querySelector<HTMLParagraphElement>('#status')!
const log = (line: string) => {
  logEl.textContent += `${new Date().toLocaleTimeString()}  ${line}\n`
}

async function fingerprint(key: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(key)))
  return [...digest.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function token(name: string): Promise<{ token: string; url: string }> {
  const response = await fetch('/api/dev/voice-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room: ROOM, name }),
  })
  if (!response.ok) throw new Error(`token request failed: ${response.status}`)
  return response.json()
}

async function start(role: Role) {
  document.querySelectorAll('button').forEach((b) => (b.disabled = true))
  const name = NAMES[role]

  // Created inside the click handler, so the browser allows it to run.
  const audio = new AudioContext()
  const analysers = new Map<string, { name: string; analyser: AnalyserNode }>()

  const t0 = performance.now()
  await init()
  const member = new Member(name)
  log(`MLS module loaded in ${Math.round(performance.now() - t0)} ms`)

  const keyProvider = new ExternalE2EEKeyProvider()
  const room = new Room({
    e2ee: {
      keyProvider,
      worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
        type: 'module',
      }),
    },
  })

  let encryptionErrors = 0
  room
    .on(RoomEvent.EncryptionError, (error) => {
      encryptionErrors += 1
      if (encryptionErrors <= 3 || encryptionErrors % 50 === 0)
        log(`encryption error #${encryptionErrors}: ${error.message}`)
    })
    .on(RoomEvent.ParticipantEncryptionStatusChanged, (enabled: boolean, p?: Participant) =>
      log(`encryption ${enabled ? 'ON' : 'off'} for ${p?.name ?? '?'}`),
    )
    .on(RoomEvent.TrackSubscribed, (track, _pub, p: RemoteParticipant) => {
      if (track.kind !== Track.Kind.Audio) return
      // Chrome only feeds remote WebRTC audio into Web Audio while an element plays it.
      const element = track.attach()
      element.muted = true
      document.body.append(element)
      const source = audio.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]))
      const analyser = audio.createAnalyser()
      analyser.fftSize = 8192
      source.connect(analyser)
      analysers.set(p.identity, { name: p.name ?? '?', analyser })
      log(`subscribed to ${p.name}`)
    })
    .on(RoomEvent.TrackUnsubscribed, (_track, _pub, p: RemoteParticipant) => {
      analysers.delete(p.identity)
    })

  const resultsEl = document.querySelector<HTMLTableSectionElement>('#results tbody')!
  window.setInterval(() => {
    resultsEl.replaceChildren(
      ...[...analysers.values()].map(({ name: from, analyser }) => {
        const bins = new Float32Array(analyser.frequencyBinCount)
        analyser.getFloatFrequencyData(bins)
        let peak = 0
        for (let i = 1; i < bins.length; i++) if (bins[i] > bins[peak]) peak = i
        const peakHz = (peak * audio.sampleRate) / analyser.fftSize
        const peakDb = bins[peak]
        const expected = TONES[from]
        const verdict =
          peakDb < SILENCE_DB
            ? 'silence (cannot decrypt)'
            : Math.abs(peakHz - expected) <= TONE_TOLERANCE_HZ
              ? `clear ${expected} Hz tone (decrypted)`
              : `noise, peak ${Math.round(peakHz)} Hz`
        const row = document.createElement('tr')
        for (const text of [from, verdict, `${Math.round(peakDb)} dB`]) {
          const cell = document.createElement('td')
          cell.textContent = text
          row.append(cell)
        }
        return row
      }),
    )
  }, 1000)

  async function useKey(key: Uint8Array, source: string) {
    await keyProvider.setKey(key.slice().buffer)
    await room.setE2EEEnabled(true)
    log(`voice key from ${source}, fingerprint ${await fingerprint(key)}`)
    const oscillator = audio.createOscillator()
    oscillator.frequency.value = TONES[name]
    const gain = audio.createGain()
    gain.gain.value = 0.2
    const destination = audio.createMediaStreamDestination()
    oscillator.connect(gain).connect(destination)
    oscillator.start()
    await room.localParticipant.publishTrack(destination.stream.getAudioTracks()[0], {
      source: Track.Source.Microphone,
      dtx: false,
    })
    log(`sending a ${TONES[name]} Hz tone`)
    statusEl.textContent = `${name}: encrypted call, key ${await fingerprint(key)}, sending ${TONES[name]} Hz`
  }

  const send = (data: Uint8Array, topic: string, to?: string) =>
    room.localParticipant.publishData(new Uint8Array(data), {
      reliable: true,
      topic,
      destinationIdentities: to ? [to] : undefined,
    })

  room.on(RoomEvent.DataReceived, async (payload, participant, _kind, topic) => {
    try {
      if (role === 'creator' && topic === TOPIC_KEY_PACKAGE && participant) {
        const welcome = member.addMember(payload)
        log(`added ${participant.name} to the MLS group, epoch ${member.epoch()}`)
        await send(welcome, TOPIC_WELCOME, participant.identity)
        await useKey(member.voiceKey(), `MLS epoch ${member.epoch()}`)
      } else if (role === 'joiner' && topic === TOPIC_WELCOME) {
        member.join(payload)
        log(`joined the MLS group from Welcome, epoch ${member.epoch()}`)
        await useKey(member.voiceKey(), `MLS epoch ${member.epoch()}`)
      }
    } catch (error) {
      log(`MLS error: ${String(error)}`)
    }
  })

  const { token: jwt, url } = await token(name)
  await room.connect(url, jwt)
  statusEl.textContent = `${name}: connected, waiting for key`
  log(`connected to ${ROOM} as ${name}`)

  if (role === 'creator') {
    member.createGroup()
    log('created MLS group, waiting for a key package')
  } else if (role === 'joiner') {
    const sendKeyPackage = async () => {
      await send(member.keyPackage(), TOPIC_KEY_PACKAGE)
      log('sent key package')
    }
    await sendKeyPackage()
    // If the creator connects later, send it again.
    room.on(RoomEvent.ParticipantConnected, () => {
      if (!member.epoch()) void sendKeyPackage()
    })
  } else {
    await useKey(crypto.getRandomValues(new Uint8Array(32)), 'random bytes (not in the group)')
  }
}

document.querySelectorAll<HTMLButtonElement>('button[data-role]').forEach((button) =>
  button.addEventListener('click', () =>
    start(button.dataset.role as Role).catch((e) => log(`failed: ${String(e)}`)),
  ),
)
