// SPDX-License-Identifier: AGPL-3.0-only
import { LocalAudioTrack, RemoteAudioTrack, Track, type Room } from 'livekit-client'
import { request } from '../api/http'

/**
 * What one call looked like, sent once when it ends (ADR 0011). The server
 * keeps only anonymous daily ranges of these numbers: no user or channel.
 */
export type CallReport = {
  join_ms?: number
  rtt_ms?: number
  loss_pct?: number
  concealed_pct?: number
  duration_s: number
  reconnects: number
}

export const sendCallReport = (report: CallReport) =>
  request<void>('/api/metrics/call', { method: 'POST', body: report, keepalive: true })

const OPUS_SAMPLE_RATE = 48_000

/** Collects a call's quality while it runs; `finish()` gives the report. */
export class CallQuality {
  private readonly startedAt = performance.now()
  private joinMs?: number
  private rtts: number[] = []
  private reconnects = 0
  // Totals over all incoming audio, from the first sample to the last.
  private first = new Map<
    string,
    { lost: number; received: number; concealed: number; total: number }
  >()
  private last = new Map<
    string,
    { lost: number; received: number; concealed: number; total: number }
  >()

  /** `joinStartedAt` is when the user pressed Join (performance.now()). */
  joined(joinStartedAt?: number) {
    if (this.joinMs === undefined && joinStartedAt !== undefined)
      this.joinMs = Math.round(performance.now() - joinStartedAt)
  }

  reconnected() {
    this.reconnects += 1
  }

  /** Takes one sample from the room's live connection. */
  async sample(room: Room) {
    const mic = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
    if (mic instanceof LocalAudioTrack) {
      const sender = await mic.getSenderStats()
      if (sender?.roundTripTime !== undefined) this.rtts.push(sender.roundTripTime * 1000)
    }
    for (const p of room.remoteParticipants.values()) {
      const track = p.getTrackPublication(Track.Source.Microphone)?.audioTrack
      if (!(track instanceof RemoteAudioTrack)) continue
      const s = await track.getReceiverStats()
      if (!s) continue
      const totals = {
        lost: s.packetsLost ?? 0,
        received: s.packetsReceived ?? 0,
        concealed: (s.concealedSamples ?? 0) - (s.silentConcealedSamples ?? 0),
        total: (s.totalSamplesDuration ?? 0) * OPUS_SAMPLE_RATE,
      }
      if (!this.first.has(p.identity)) this.first.set(p.identity, totals)
      this.last.set(p.identity, totals)
    }
  }

  finish(): CallReport {
    let lost = 0
    let received = 0
    let concealed = 0
    let total = 0
    for (const [id, end] of this.last) {
      const start = this.first.get(id)!
      lost += end.lost - start.lost
      received += end.received - start.received
      concealed += end.concealed - start.concealed
      total += end.total - start.total
    }
    const pct = (part: number, whole: number) =>
      whole > 0 ? Math.min(100, Math.max(0, Math.round((part / whole) * 1000) / 10)) : undefined
    const sorted = [...this.rtts].sort((a, b) => a - b)

    return {
      join_ms: this.joinMs,
      rtt_ms: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)]) : undefined,
      loss_pct: pct(lost, lost + received),
      concealed_pct: pct(concealed, total),
      duration_s: Math.round((performance.now() - this.startedAt) / 1000),
      reconnects: this.reconnects,
    }
  }
}
