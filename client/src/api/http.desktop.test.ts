// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'
import { request } from './http'

// As in the desktop app: the API is on another origin and the token is stored.
vi.mock('../platform', () => ({
  isDesktop: true,
  apiOrigin: 'http://127.0.0.1:4000',
  sessionToken: () => Promise.resolve('stored-token'),
}))

describe('request in the desktop app', () => {
  it('calls the server URL with a bearer token and no cookies', async () => {
    const calls: [string, RequestInit][] = []
    const fetchFn = (url: string, init: RequestInit) => {
      calls.push([url, init])
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }))
    }

    await request('/api/me', { fetchFn: fetchFn as typeof fetch })

    const [url, init] = calls[0]
    expect(url).toBe('http://127.0.0.1:4000/api/me')
    expect(init.credentials).toBe('omit')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer stored-token')
  })
})
