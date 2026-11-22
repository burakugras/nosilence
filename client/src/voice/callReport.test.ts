// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'
import { CallQuality } from './callReport'

describe('CallQuality', () => {
  it('reports join time, reconnects and duration, without stats if none were taken', () => {
    vi.spyOn(performance, 'now').mockReturnValue(1_000)
    const quality = new CallQuality()
    vi.spyOn(performance, 'now').mockReturnValue(1_850)
    quality.joined(1_000)
    quality.joined(500) // only the first join counts
    quality.reconnected()
    vi.spyOn(performance, 'now').mockReturnValue(61_000)

    expect(quality.finish()).toEqual({
      join_ms: 850,
      rtt_ms: undefined,
      loss_pct: undefined,
      concealed_pct: undefined,
      duration_s: 60,
      reconnects: 1,
    })
    vi.restoreAllMocks()
  })
})
