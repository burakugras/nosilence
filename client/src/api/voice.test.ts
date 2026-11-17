// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'
import { requestVoiceJoin, VoiceJoinError } from './voice'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('requestVoiceJoin', () => {
  it('posts room and name and returns the join details', async () => {
    const join = { token: 't', url: 'ws://x', room: 'lobby', identity: 'id' }
    const fetchFn = vi.fn().mockResolvedValue(json(200, join))

    await expect(requestVoiceJoin('lobby', 'Burak', fetchFn)).resolves.toEqual(join)

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/dev/voice-token')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ room: 'lobby', name: 'Burak' })
  })

  it('turns 422 responses into field errors', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(422, { errors: { room: 'bad' } }))

    const error = await requestVoiceJoin('x', 'y', fetchFn).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(VoiceJoinError)
    expect((error as VoiceJoinError).fieldErrors).toEqual({ room: 'bad' })
  })

  it('reports an unreachable server', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(requestVoiceJoin('lobby', 'Burak', fetchFn)).rejects.toThrow(/Cannot reach/)
  })

  it('reports other server errors', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(500, {}))
    await expect(requestVoiceJoin('lobby', 'Burak', fetchFn)).rejects.toThrow(/500/)
  })
})
