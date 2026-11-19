// SPDX-License-Identifier: AGPL-3.0-only
import { Presence, Socket } from 'phoenix'
import { fetchSocketTicket } from '../api/messages'
import { ApiError } from '../api/http'
import type { ConnectCommunity, OnlineMember } from './types'

// Retry quickly at first so a short network drop recovers within the 3 s target.
const RECONNECT_MS = [100, 500, 1000, 2000]

let socket: Socket | undefined
let ticket = ''
let users = 0

/**
 * Refreshes the 60-second ticket. A reconnect attempt that races this uses the
 * old ticket, fails, and the next attempt carries the fresh one.
 */
async function refreshTicket() {
  try {
    ticket = await fetchSocketTicket()
  } catch (error) {
    // Signed out: stop trying instead of retrying forever.
    if (error instanceof ApiError && error.status === 401) socket?.disconnect()
  }
}

async function acquireSocket(): Promise<Socket> {
  users += 1
  if (socket) return socket
  const s = new Socket('/socket', {
    authToken: () => ticket,
    reconnectAfterMs: (tries) => RECONNECT_MS[tries - 1] ?? 3000,
    rejoinAfterMs: (tries) => RECONNECT_MS[tries - 1] ?? 3000,
  })
  socket = s
  s.onError(() => void refreshTicket())
  await refreshTicket()
  s.connect()
  return s
}

function releaseSocket() {
  users -= 1
  if (users === 0 && socket) {
    socket.disconnect()
    socket = undefined
  }
}

/** One shared WebSocket; one channel per open community page. */
export const connectCommunity: ConnectCommunity = (communityId, listener) => {
  let closed = false
  let voiceChannelId: string | null = null
  let channel: ReturnType<Socket['channel']> | undefined

  void acquireSocket().then((s) => {
    if (closed) return releaseSocket()
    const ch = s.channel(`community:${communityId}`)
    channel = ch
    const presence = new Presence(ch)
    presence.onSync(() =>
      listener.presence(
        presence.list<OnlineMember>((id, { metas }) => ({
          id,
          display_name: String(metas[0]?.display_name ?? ''),
          // Several tabs or devices: any one of them in voice counts.
          voice_channel_id:
            (metas.map((m) => m.voice_channel_id).find(Boolean) as string | undefined) ?? null,
        })),
      ),
    )
    ch.on('message_created', (message) => listener.event({ type: 'message_created', message }))
    ch.on('message_deleted', (p) => listener.event({ type: 'message_deleted', ...p }))
    ch.on('member_joined', (p) => listener.event({ type: 'member_joined', ...p }))
    ch.on('member_removed', (p) => listener.event({ type: 'member_removed', ...p }))
    ch.on('channel_created', (channel) => listener.event({ type: 'channel_created', channel }))
    ch.on('removed', () => listener.removed())
    ch.join()
      .receive('ok', () => {
        // After a reconnect the server has forgotten our voice channel; tell it again.
        if (voiceChannelId) ch.push('voice_join', { channel_id: voiceChannelId })
        listener.joined()
      })
      .receive('error', () => listener.removed())
  })

  return {
    setVoiceChannel(channelId) {
      voiceChannelId = channelId
      channel?.push(channelId ? 'voice_join' : 'voice_leave', { channel_id: channelId })
    },
    close() {
      if (closed) return
      closed = true
      if (channel) {
        channel.leave()
        releaseSocket()
      }
    },
  }
}
