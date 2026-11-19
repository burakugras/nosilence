// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type VoiceJoin = {
  token: string
  url: string
  room: string
  identity: string
}

/** LiveKit token for a room. Needs a session; the name comes from the account. */
export const requestVoiceJoin = (room: string, fetchFn?: typeof fetch) =>
  request<VoiceJoin>('/api/voice/token', { method: 'POST', body: { room }, fetchFn })
