// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './http'

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('request', () => {
  it('sends JSON with the same-origin cookie and returns the body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, { ok: true }))

    await expect(request('/api/x', { method: 'POST', body: { a: 1 }, fetchFn })).resolves.toEqual({
      ok: true,
    })

    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('/api/x')
    expect(init.credentials).toBe('same-origin')
    expect(init.headers['content-type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ a: 1 })
  })

  it('always sends a JSON body on state-changing requests (CSRF rule)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    await request('/api/session', { method: 'DELETE', fetchFn })
    const [, init] = fetchFn.mock.calls[0]
    expect(init.headers['content-type']).toBe('application/json')
    expect(init.body).toBe('{}')
  })

  it('sends no body and no content type on GET', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(200, {}))
    await request('/api/me', { fetchFn })
    const [, init] = fetchFn.mock.calls[0]
    expect(init.body).toBeUndefined()
    expect(init.headers['content-type']).toBeUndefined()
  })

  it('turns error responses into ApiError with status and field errors', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(json(422, { errors: { email: ['has already been taken'] } }))

    const error = (await request('/api/accounts', { method: 'POST', fetchFn }).catch(
      (e: unknown) => e,
    )) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(422)
    expect(error.field('email')).toBe('has already been taken')
  })

  it('uses the server message when there is one', async () => {
    const fetchFn = vi.fn().mockResolvedValue(json(401, { error: 'wrong email or password' }))
    await expect(request('/api/session', { method: 'POST', fetchFn })).rejects.toThrow(
      'wrong email or password',
    )
  })

  it('reports an unreachable server with status 0', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    const error = (await request('/api/me', { fetchFn }).catch((e: unknown) => e)) as ApiError
    expect(error.status).toBe(0)
    expect(error.message).toMatch(/Cannot reach/)
  })
})
