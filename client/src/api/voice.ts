// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type VoiceJoin = {
  token: string
  url: string
  room: string
  identity: string
}

/**
 * LiveKit token for a channel's voice room. Members only; answers 409 when the
 * channel is full and 503 when voice is unavailable.
 */
export const requestChannelJoin = (channelId: string) =>
  request<VoiceJoin>(`/api/channels/${channelId}/voice-token`, { method: 'POST' })
