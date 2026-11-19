// SPDX-License-Identifier: AGPL-3.0-only
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
  useRemoteParticipants,
} from '@livekit/components-react'
import {
  LocalAudioTrack,
  RemoteAudioTrack,
  Track,
  type Participant,
  type RemoteParticipant,
} from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import type { VoiceJoin } from '../api/voice'
import { summariseInbound, type InboundAudioSample, type InboundAudioSummary } from './stats'

type Props = {
  join: VoiceJoin
  /** Shown as the heading, e.g. "Community · Channel". */
  title: string
  /** Connected to the room (used to show the user in the channel for others). */
  onConnected?: () => void
  onLeave: () => void
}

export function VoiceRoom({ join, title, onConnected, onLeave }: Props) {
  return (
    <LiveKitRoom
      serverUrl={join.url}
      token={join.token}
      connect
      audio={{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }}
      video={false}
      onConnected={onConnected}
      onDisconnected={onLeave}
      className="voice-room"
    >
      <h2>{title}</h2>
      <ParticipantList />
      <div className="controls">
        <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      <ConnectionStats />
      <IncomingAudioStats />
      {/* Plays every remote participant's audio. */}
      <RoomAudioRenderer />
    </LiveKitRoom>
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
