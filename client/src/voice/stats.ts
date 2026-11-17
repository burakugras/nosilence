// SPDX-License-Identifier: AGPL-3.0-only

/** The subset of WebRTC inbound audio stats we use. */
export type InboundAudioSample = {
  packetsLost?: number
  packetsReceived?: number
  jitter?: number
  concealedSamples?: number
  silentConcealedSamples?: number
  totalSamplesDuration?: number
}

export type InboundAudioSummary = {
  /** Lost packets as a share of all packets in the interval, 0..1. */
  lossRate?: number
  /** Jitter in milliseconds. */
  jitterMs?: number
  /**
   * Share of played audio that the browser had to invent because data was missing
   * or late (excluding silence), 0..1. This is what listeners hear as choppy audio.
   */
  concealedRate?: number
}

const OPUS_SAMPLE_RATE = 48_000

const delta = (current?: number, previous?: number) =>
  current === undefined ? undefined : current - (previous ?? 0)

/** Summarises the interval between two consecutive stats samples. */
export function summariseInbound(
  current: InboundAudioSample,
  previous: InboundAudioSample = {},
): InboundAudioSummary {
  const lost = delta(current.packetsLost, previous.packetsLost)
  const received = delta(current.packetsReceived, previous.packetsReceived)
  const concealed = delta(current.concealedSamples, previous.concealedSamples)
  const silent = delta(current.silentConcealedSamples, previous.silentConcealedSamples) ?? 0
  const seconds = delta(current.totalSamplesDuration, previous.totalSamplesDuration)

  const totalPackets = (lost ?? 0) + (received ?? 0)
  const samples = seconds === undefined ? 0 : seconds * OPUS_SAMPLE_RATE

  return {
    lossRate: lost !== undefined && totalPackets > 0 ? Math.max(0, lost) / totalPackets : undefined,
    jitterMs: current.jitter !== undefined ? current.jitter * 1000 : undefined,
    concealedRate:
      concealed !== undefined && samples > 0
        ? Math.min(1, Math.max(0, concealed - silent) / samples)
        : undefined,
  }
}
