// SPDX-License-Identifier: AGPL-3.0-only
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useRoomContext,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRemoteParticipants,
} from '@livekit/components-react'
import {
  ConnectionState,
  createLocalAudioTrack,
  isE2EESupported,
  LocalAudioTrack,
  RemoteAudioTrack,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import type { VoiceJoin } from '../api/voice'
import { MlsKeyProvider } from '../e2ee/keyProvider'
import { loadMls } from '../e2ee/mls'
import { VoiceSession, type E2eeStatus } from '../e2ee/session'
import { openVoiceTopic } from '../gateway/phoenixGateway'
import { beforeQuit } from '../platform'
import type { OpenVoiceTopic } from '../gateway/types'
import { CallQuality, sendCallReport } from './callReport'
import { watchPushToTalk } from './pushToTalk'
import { CAPTURE, formatKeys, getVoiceSettings, useVoiceSettings } from './settings'
import { summariseInbound, type InboundAudioSample, type InboundAudioSummary } from './stats'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

type Props = {
  join: VoiceJoin
  channelId: string
  /** Shown as the heading, e.g. "Community · Channel". */
  title: string
  /** Connected to the room (used to show the user in the channel for others). */
  onConnected?: () => void
  /** When the user pressed Join (performance.now()), to measure the join time. */
  joinStartedAt?: number
  onLeave: () => void
  openTopic?: OpenVoiceTopic
}

type Status = E2eeStatus | { state: 'ended'; reason: 'unsupported' }

/** A LiveKit room whose media keys come only from our MLS group (ADR 0007). */
function createRoom() {
  const keyProvider = new MlsKeyProvider()
  const { speakerId } = getVoiceSettings()
  const room = new Room({
    audioOutput: speakerId ? { deviceId: speakerId } : undefined,
    e2ee: {
      keyProvider,
      worker: new Worker(new URL('livekit-client/e2ee-worker', import.meta.url), {
        type: 'module',
      }),
    },
  })
  return { room, keyProvider }
}

export function VoiceRoom({
  join,
  channelId,
  title,
  onConnected,
  onLeave,
  joinStartedAt,
  openTopic = openVoiceTopic,
}: Props) {
  const [{ room, keyProvider }] = useState(createRoom)
  const [status, setStatus] = useState<Status>(() =>
    isE2EESupported() ? { state: 'securing' } : { state: 'ended', reason: 'unsupported' },
  )
  // Connect to LiveKit, and so publish the microphone, only once we hold a key.
  const [keyed, setKeyed] = useState(false)

  useEffect(() => {
    if (!isE2EESupported()) return
    let session: VoiceSession | undefined
    let cancelled = false
    void (async () => {
      try {
        const newGroup = await loadMls()
        await room.setE2EEEnabled(true)
        if (cancelled) return
        session = new VoiceSession({
          channelId,
          identity: join.identity,
          newGroup,
          openTopic,
          onKey: (key, epoch) =>
            void keyProvider.setEpochKey(key, epoch).then(() => !cancelled && setKeyed(true)),
          onStatus: (s) => !cancelled && setStatus(s),
        })
        session.start()
      } catch {
        if (!cancelled) setStatus({ state: 'ended', reason: 'failed' })
      }
    })()
    return () => {
      cancelled = true
      session?.stop()
    }
  }, [room, keyProvider, channelId, join.identity, openTopic])

  // Anonymous call quality, sent once when the call ends (ADR 0011).
  const [quality] = useState(() => new CallQuality())
  useEffect(() => {
    const onReconnecting = () => quality.reconnected()
    room.on(RoomEvent.Reconnecting, onReconnecting)
    const timer = window.setInterval(() => void quality.sample(room).catch(() => undefined), 5000)
    // Development builds only: the network test tool (tools/netlab) drives the room.
    if (import.meta.env.DEV)
      (window as unknown as { __nosilenceRoom?: Room }).__nosilenceRoom = room
    return () => {
      room.off(RoomEvent.Reconnecting, onReconnecting)
      window.clearInterval(timer)
      const report = quality.finish()
      if (report.join_ms !== undefined && report.duration_s >= 1)
        sendCallReport(report).catch(() => undefined)
    }
  }, [room, quality])

  // Quitting the desktop app: say goodbye to LiveKit so others see us leave at once.
  useEffect(() => beforeQuit(() => room.disconnect()), [room])

  // Never stay connected without encryption.
  const ended = status.state === 'ended'
  useEffect(() => {
    if (ended) void room.disconnect()
  }, [ended, room])

  return (
    <LiveKitRoom
      room={room}
      serverUrl={join.url}
      token={join.token}
      connect={keyed && !ended}
      // The microphone is published by <Microphone>, muted first in push-to-talk.
      audio={false}
      video={false}
      onConnected={() => {
        quality.joined(joinStartedAt)
        onConnected?.()
      }}
      onDisconnected={() => !ended && onLeave()}
      className="voice-room"
    >
      <h2>{title}</h2>
      <EncryptionPanel status={status} />
      {!ended && <ParticipantList />}
      {!ended && <Microphone onLeave={onLeave} />}
      {ended && (
        <div className="controls">
          <button type="button" onClick={onLeave}>
            Leave
          </button>
        </div>
      )}
      {!ended && (
        <>
          <ConnectionStats />
          <IncomingAudioStats />
          {/* Plays every remote participant's audio. */}
          <RoomAudioRenderer />
        </>
      )}
    </LiveKitRoom>
  )
}

/**
 * Publishes the microphone with the chosen device, talks only while the
 * push-to-talk keys are held (muted from the start), follows device changes
 * during the call, and shows the call's controls and voice settings.
 */
function Microphone({ onLeave }: { onLeave: () => void }) {
  const room = useRoomContext()
  const connection = useConnectionState()
  const settings = useVoiceSettings()
  const [track, setTrack] = useState<LocalAudioTrack>()
  const [failed, setFailed] = useState(false)
  const [talking, setTalking] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const publishing = useRef(false)

  // Once connected: open the microphone and publish it (once per call).
  useEffect(() => {
    if (connection !== ConnectionState.Connected || publishing.current) return
    publishing.current = true
    void (async () => {
      const { microphoneId, mode } = getVoiceSettings()
      const mic = await createLocalAudioTrack({
        ...CAPTURE,
        deviceId: microphoneId || undefined,
      })
      // Push-to-talk: nothing is sent before the keys are held.
      if (mode === 'push') await mic.mute()
      await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone })
      setTrack(mic)
    })().catch(() => setFailed(true))
  }, [connection, room])

  // Devices chosen during the call (the call started with the saved ones).
  const devices = useRef(getVoiceSettings())
  useEffect(() => {
    if (!track || settings.microphoneId === devices.current.microphoneId) return
    devices.current = { ...devices.current, microphoneId: settings.microphoneId }
    void room.switchActiveDevice('audioinput', settings.microphoneId || 'default').catch(() => {})
  }, [room, track, settings.microphoneId])
  useEffect(() => {
    if (settings.speakerId === devices.current.speakerId) return
    devices.current = { ...devices.current, speakerId: settings.speakerId }
    void room.switchActiveDevice('audiooutput', settings.speakerId || 'default').catch(() => {})
  }, [room, settings.speakerId])

  // Voice activity: always open (the user can still mute). Push-to-talk:
  // open only while the keys are held.
  const pushKeys = settings.mode === 'push' ? settings.pushKeys.join('+') : ''
  useEffect(() => {
    if (!track) return
    if (!pushKeys) {
      void track.unmute()
      return
    }
    void track.mute()
    return watchPushToTalk(pushKeys.split('+'), (down) => {
      setTalking(down)
      void (down ? track.unmute() : track.mute())
    })
  }, [track, pushKeys])

  return (
    <>
      <div className="controls">
        {settings.mode === 'push' ? (
          <p className={talking ? 'ptt talking' : 'ptt'} role="status">
            {talking ? 'Talking' : `Hold ${formatKeys(settings.pushKeys)} to talk`}
          </p>
        ) : (
          <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
        )}
        <button
          type="button"
          aria-expanded={showSettings}
          onClick={() => setShowSettings((v) => !v)}
        >
          Voice settings
        </button>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      {failed && (
        <p className="form-message" role="alert">
          The microphone could not be opened. Check that the browser may use it, then join again.
        </p>
      )}
      {showSettings && <VoiceSettingsPanel liveTrack={track?.mediaStreamTrack} />}
    </>
  )
}

const ENDED: Record<string, string> = {
  unsupported:
    'This browser cannot encrypt calls end to end, so you cannot join. Try a current Chrome, Edge or Firefox.',
  failed: 'The call could not be encrypted, so you were disconnected. Leave and join again.',
  removed: 'You no longer have access to this channel.',
  superseded: 'You joined this channel from another tab or device.',
}

/** Shows that the call is end-to-end encrypted, with whom, and the code to compare. */
export function EncryptionPanel({ status }: { status: Status }) {
  const participants = useParticipants()
  if (status.state === 'securing')
    return (
      <p className="e2ee" role="status">
        Securing the call…
      </p>
    )
  if (status.state === 'ended')
    return (
      <p className="e2ee e2ee-off" role="alert">
        {ENDED[status.reason]}
      </p>
    )

  const names = new Map(participants.map((p) => [p.identity, p.name || 'Anonymous']))
  return (
    <section className="e2ee" aria-label="Encryption">
      <p>
        <span aria-hidden="true">🔒</span> <strong>End-to-end encrypted.</strong> Only the people
        below hold the key; the server cannot listen.
      </p>
      <p className="muted">
        Key shared with:{' '}
        {status.members
          .map((id) => names.get(id) ?? 'someone not in this call (check the code!)')
          .join(', ')}
      </p>
      <p>
        Verification code: <code className="verification-code">{status.code}</code>
      </p>
      <p className="muted">
        Compare it with the others in the call (for example by reading it aloud). If everyone sees
        the same code, nobody else is listening in. It changes when someone joins or leaves.
      </p>
    </section>
  )
}

function ParticipantList() {
  const participants = useParticipants()
  return (
    <ul className="participants" aria-label="Participants">
      {participants.map((p) => (
        <ParticipantRow key={p.identity} participant={p} />
      ))}
    </ul>
  )
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant)
  return (
    <li className={speaking ? 'speaking' : undefined}>
      <span className="dot" aria-hidden="true" />
      {participant.name || 'Anonymous'}
      {participant.isLocal && ' (you)'}
      {speaking && <span className="visually-hidden"> is speaking</span>}
    </li>
  )
}

type Stats = { rttMs?: number; jitterMs?: number; packetsLost?: number }

/**
 * First latency measurement (roadmap Phase 1): round-trip time and jitter of our
 * outgoing audio as reported by WebRTC. Full mouth-to-ear p95 comes in Phase 7.
 */
function ConnectionStats() {
  const { localParticipant } = useLocalParticipant()
  const [stats, setStats] = useState<Stats>({})

  useEffect(() => {
    let cancelled = false
    const timer = window.setInterval(async () => {
      const track = localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
      if (!(track instanceof LocalAudioTrack)) return
      const sender = await track.getSenderStats()
      if (cancelled || !sender) return
      setStats({
        rttMs: sender.roundTripTime !== undefined ? sender.roundTripTime * 1000 : undefined,
        jitterMs: sender.jitter !== undefined ? sender.jitter * 1000 : undefined,
        packetsLost: sender.packetsLost,
      })
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [localParticipant])

  const fmt = (v?: number) => (v === undefined ? '–' : `${Math.round(v)} ms`)
  return (
    <dl className="stats" aria-label="Connection">
      <dt>Round trip</dt>
      <dd>{fmt(stats.rttMs)}</dd>
      <dt>Jitter</dt>
      <dd>{fmt(stats.jitterMs)}</dd>
      <dt>Packets lost</dt>
      <dd>{stats.packetsLost ?? '–'}</dd>
    </dl>
  )
}

const pct = (v?: number) => (v === undefined ? '–' : `${(v * 100).toFixed(1)} %`)
const ms = (v?: number) => (v === undefined ? '–' : `${Math.round(v)} ms`)

/**
 * What we receive from each other participant over the last two seconds.
 * "Concealed" is the share of audio the browser had to fill in because packets
 * were missing or late; above about 2 % speech starts to sound choppy.
 */
function IncomingAudioStats() {
  const participants = useRemoteParticipants()
  if (participants.length === 0) return null
  return (
    <table className="stats-table">
      <caption>Incoming audio</caption>
      <thead>
        <tr>
          <th scope="col">From</th>
          <th scope="col">Lost</th>
          <th scope="col">Jitter</th>
          <th scope="col">Concealed</th>
        </tr>
      </thead>
      <tbody>
        {participants.map((p) => (
          <IncomingRow key={p.identity} participant={p} />
        ))}
      </tbody>
    </table>
  )
}

function IncomingRow({ participant }: { participant: RemoteParticipant }) {
  const [summary, setSummary] = useState<InboundAudioSummary>({})
  const previous = useRef<InboundAudioSample | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const timer = window.setInterval(async () => {
      const track = participant.getTrackPublication(Track.Source.Microphone)?.audioTrack
      if (!(track instanceof RemoteAudioTrack)) return
      const current = await track.getReceiverStats()
      if (cancelled || !current) return
      setSummary(summariseInbound(current, previous.current))
      previous.current = current
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [participant])

  return (
    <tr>
      <th scope="row">{participant.name || 'Anonymous'}</th>
      <td>{pct(summary.lossRate)}</td>
      <td>{ms(summary.jitterMs)}</td>
      <td>{pct(summary.concealedRate)}</td>
    </tr>
  )
}
