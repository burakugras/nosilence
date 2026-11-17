// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { summariseInbound } from './stats'

describe('summariseInbound', () => {
  it('reports a clean interval as zero loss and zero concealment', () => {
    const previous = {
      packetsLost: 0,
      packetsReceived: 100,
      concealedSamples: 0,
      totalSamplesDuration: 2,
    }
    const current = {
      packetsLost: 0,
      packetsReceived: 200,
      concealedSamples: 0,
      totalSamplesDuration: 4,
      jitter: 0.002,
    }

    expect(summariseInbound(current, previous)).toEqual({
      lossRate: 0,
      jitterMs: 2,
      concealedRate: 0,
    })
  })

  it('uses only the change since the previous sample', () => {
    const previous = {
      packetsLost: 10,
      packetsReceived: 90,
      concealedSamples: 4_800,
      totalSamplesDuration: 2,
    }
    // 10 more lost out of 100 packets; 9 600 concealed samples over 2 s (96 000 samples)
    const current = {
      packetsLost: 20,
      packetsReceived: 180,
      concealedSamples: 14_400,
      totalSamplesDuration: 4,
    }

    const summary = summariseInbound(current, previous)
    expect(summary.lossRate).toBeCloseTo(0.1)
    expect(summary.concealedRate).toBeCloseTo(0.1)
  })

  it('does not count concealed silence as choppy audio', () => {
    const current = {
      concealedSamples: 48_000,
      silentConcealedSamples: 48_000,
      totalSamplesDuration: 1,
    }
    expect(summariseInbound(current).concealedRate).toBe(0)
  })

  it('leaves values undefined when the browser does not report them', () => {
    expect(summariseInbound({})).toEqual({
      lossRate: undefined,
      jitterMs: undefined,
      concealedRate: undefined,
    })
  })
})
