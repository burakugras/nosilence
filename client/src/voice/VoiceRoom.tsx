// SPDX-License-Identifier: AGPL-3.0-only
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useRoomContext,
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
} from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import type { VoiceJoin } from '../api/voice'
import { MlsKeyProvider } from '../e2ee/keyProvider'
import { loadMls } from '../e2ee/mls'
import { VoiceSession } from '../e2ee/session'
import { openVoiceTopic } from '../gateway/phoenixGateway'
import type { OpenVoiceTopic } from '../gateway/types'
import { beforeQuit } from '../platform'
import { CallQuality, sendCallReport } from './callReport'
import { reportCall, resetCallState, useControls, type CallStatus } from './callState'
import { watchPushToTalk } from './pushToTalk'
import { CAPTURE, getVoiceSettings, useVoiceSettings } from './settings'
import { summariseInbound, type InboundAudioSample } from './stats'

type Props = {
  join: VoiceJoin
  channelId: string
  /** Connected to the room (used to show the user in the channel for others). */
  onConnected?: () => void
  /** When the user pressed Join (performance.now()), to measure the join time. */
  joinStartedAt?: number
  onLeave: () => void
  openTopic?: OpenVoiceTopic
}

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

/**
 * The call itself: encryption, audio, the microphone. It shows nothing; what
 * the user sees (the voice panel, its bubble, who is speaking) reads what this
 * reports to voice/callState.ts (ADR 0016).
 */
export function VoiceRoom({
  join,
  channelId,
  onConnected,
  onLeave,
  joinStartedAt,
  openTopic = openVoiceTopic,
}: Props) {
  const [{ room, keyProvider }] = useState(createRoom)
  const [status, setStatus] = useState<CallStatus>(() =>
    isE2EESupported() ? { state: 'securing' } : { state: 'ended', reason: 'unsupported' },
  )
  // Connect to LiveKit, and so publish the microphone, only once we hold a key.
  const [keyed, setKeyed] = useState(false)
  const { deafened } = useControls()

  useEffect(() => {
    reportCall({ status })
  }, [status])
  useEffect(() => () => resetCallState(), [])

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
      {!ended && (
        <>
          <Microphone />
          <ConnectionReporter />
          <SpeakerReporter />
          {/* Plays every remote participant's audio; nothing while deafened. */}
          <RoomAudioRenderer muted={deafened} />
        </>
      )}
    </LiveKitRoom>
  )
}

/**
 * Publishes the microphone with the chosen device. Muted by the user's mute
 * switch; in push-to-talk it opens only while the keys are held (and nothing
 * is sent before the first press). Follows device changes during the call.
 */
function Microphone() {
  const room = useRoomContext()
  const connection = useConnectionState()
  const settings = useVoiceSettings()
  const { muted } = useControls()
  const [track, setTrack] = useState<LocalAudioTrack>()
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
      // Push-to-talk or muted: nothing is sent before the user means to talk.
      if (mode === 'push' || muted) await mic.mute()
      await room.localParticipant.publishTrack(mic, { source: Track.Source.Microphone })
      setTrack(mic)
      reportCall({ micTrack: mic.mediaStreamTrack, micFailed: false })
    })().catch(() => reportCall({ micFailed: true }))
    // `muted` is read once for the first publish; changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, room])

  // Devices chosen during the call (the call started with the saved ones).
  const devices = useRef(getVoiceSettings())
  useEffect(() => {
    if (!track || settings.microphoneId === devices.current.microphoneId) return
    devices.current = { ...devices.current, microphoneId: settings.microphoneId }
    void room
      .switchActiveDevice('audioinput', settings.microphoneId || 'default')
      .then(() => reportCall({ micTrack: track.mediaStreamTrack }))
      .catch(() => {})
  }, [room, track, settings.microphoneId])
  useEffect(() => {
    if (settings.speakerId === devices.current.speakerId) return
    devices.current = { ...devices.current, speakerId: settings.speakerId }
    void room.switchActiveDevice('audiooutput', settings.speakerId || 'default').catch(() => {})
  }, [room, settings.speakerId])

  // Muted: closed. Voice activity: open. Push-to-talk: open while the keys are held.
  const pushKeys = settings.mode === 'push' ? settings.pushKeys.join('+') : ''
  useEffect(() => {
    if (!track) return
    reportCall({ talking: false })
    if (muted) {
      void track.mute()
      return
    }
    if (!pushKeys) {
      void track.unmute()
      return
    }
    void track.mute()
    return watchPushToTalk(pushKeys.split('+'), (down) => {
      reportCall({ talking: down })
      void (down ? track.unmute() : track.mute())
    })
  }, [track, pushKeys, muted])

  return null
}

/** Round trip of our audio and the share of incoming packets lost, every two seconds. */
function ConnectionReporter() {
  const room = useRoomContext()
  const previous = useRef(new Map<string, InboundAudioSample>())

  useEffect(() => {
    let cancelled = false
    const timer = window.setInterval(async () => {
      const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
      const sender = mic instanceof LocalAudioTrack ? await mic.getSenderStats() : undefined
      const losses: number[] = []
      for (const p of room.remoteParticipants.values()) {
        const track = p.getTrackPublication(Track.Source.Microphone)?.audioTrack
        if (!(track instanceof RemoteAudioTrack)) continue
        const current = await track.getReceiverStats()
        if (!current) continue
        const { lossRate } = summariseInbound(current, previous.current.get(p.identity))
        previous.current.set(p.identity, current)
        if (lossRate !== undefined) losses.push(lossRate)
      }
      if (cancelled) return
      reportCall({
        rttMs: sender?.roundTripTime !== undefined ? sender.roundTripTime * 1000 : undefined,
        lossRate: losses.length ? Math.max(...losses) : undefined,
      })
    }, 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [room])

  return null
}

/** Who is speaking right now (the channel list highlights them). */
function SpeakerReporter() {
  const room = useRoomContext()
  useEffect(() => {
    const onChange = (speakers: Participant[]) =>
      reportCall({ speaking: speakers.map((p) => p.identity) })
    room.on(RoomEvent.ActiveSpeakersChanged, onChange)
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onChange)
    }
  }, [room])
  return null
}
