// SPDX-License-Identifier: AGPL-3.0-only
import {
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  useIsSpeaking,
  useLocalParticipant,
  useParticipants,
} from '@livekit/components-react'
import { LocalAudioTrack, Track, type Participant } from 'livekit-client'
import { useEffect, useState } from 'react'
import type { VoiceJoin } from '../api/voice'

type Props = {
  join: VoiceJoin
  onLeave: () => void
}

export function VoiceRoom({ join, onLeave }: Props) {
  return (
    <LiveKitRoom
      serverUrl={join.url}
      token={join.token}
      connect
      audio={{ echoCancellation: true, noiseSuppression: true, autoGainControl: true }}
      video={false}
      onDisconnected={onLeave}
      className="voice-room"
    >
      <h2>Room: {join.room}</h2>
      <ParticipantList />
      <div className="controls">
        <TrackToggle source={Track.Source.Microphone}>Microphone</TrackToggle>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
      <ConnectionStats />
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
