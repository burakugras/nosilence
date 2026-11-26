// SPDX-License-Identifier: AGPL-3.0-only
import { Presence, Socket } from 'phoenix'
import { fetchSocketTicket } from '../api/messages'
import { ApiError } from '../api/http'
import { socketUrl } from '../platform'
import { statusOf, type PresenceMeta } from '../presence/status'
import { rememberAvatars } from '../ui/avatars'
import type { ConnectCommunity, OnlineMember, OpenVoiceTopic } from './types'

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
  const s = new Socket(socketUrl, {
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

// Idle (ADR 0017): reported on every community topic this app has joined.
let idle = false
const communityChannels = new Set<ReturnType<Socket['channel']>>()

/** No input for a while (`presence/idle.ts`), or back again. */
export function setIdle(value: boolean) {
  if (value === idle) return
  idle = value
  communityChannels.forEach((ch) => ch.push('activity', { idle }))
}

/** One presence entry per person, from all their connections. */
export function toOnlineMember(id: string, metas: PresenceMeta[]): OnlineMember {
  const first = metas[0] ?? {}
  return {
    id,
    display_name: String(first.display_name ?? ''),
    // Several tabs or devices: any one of them in voice counts.
    voice_channel_id: metas.map((m) => m.voice_channel_id).find(Boolean) ?? null,
    avatar: first.avatar ?? null,
    status: statusOf(metas),
    status_text: first.status_text ?? null,
    status_expires_at: first.status_expires_at ?? null,
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
    presence.onSync(() => {
      const members = presence.list<OnlineMember>((id, { metas }) =>
        toOnlineMember(id, metas as PresenceMeta[]),
      )
      rememberAvatars(members)
      listener.presence(members)
    })
    ch.on('message_created', (message) => listener.event({ type: 'message_created', message }))
    ch.on('message_deleted', (p) => listener.event({ type: 'message_deleted', ...p }))
    ch.on('member_joined', (p) => listener.event({ type: 'member_joined', ...p }))
    ch.on('member_removed', (p) => listener.event({ type: 'member_removed', ...p }))
    ch.on('account_deleted', (p) => listener.event({ type: 'account_deleted', ...p }))
    ch.on('channel_created', (channel) => listener.event({ type: 'channel_created', channel }))
    ch.on('channels_changed', () => listener.event({ type: 'channels_changed' }))
    ch.on('member_updated', (p) => listener.event({ type: 'member_updated', ...p }))
    ch.on('ownership_changed', () => listener.event({ type: 'ownership_changed' }))
    ch.on('message_updated', (message) => listener.event({ type: 'message_updated', message }))
    ch.on('reaction_changed', (p) => listener.event({ type: 'reaction_changed', ...p }))
    ch.on('removed', () => listener.removed())
    communityChannels.add(ch)
    ch.join()
      .receive('ok', () => {
        // After a reconnect the server has forgotten our voice channel and idle; tell it again.
        if (voiceChannelId) ch.push('voice_join', { channel_id: voiceChannelId })
        if (idle) ch.push('activity', { idle })
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
        communityChannels.delete(channel)
        channel.leave()
        releaseSocket()
      }
    },
  }
}

/** Events on the user's own topic (ADR 0014, ADR 0015, ADR 0017). */
const USER_EVENTS = [
  'notify',
  'friends_changed',
  'conversation_changed',
  'dm_created',
  'dm_updated',
  'dm_deleted',
  'dm_reaction_changed',
  'profile_changed',
] as const
export type UserEventName = (typeof USER_EVENTS)[number] | 'joined'

/**
 * The user's own topic: friends, conversations and their messages, and
 * messages in their communities for desktop notifications. `joined` is
 * reported on every (re)join, so views can reload what they may have missed.
 * Returns a function that stops listening.
 */
export function openUserTopic(
  userId: string,
  onEvent: (event: UserEventName, payload: unknown) => void,
) {
  let closed = false
  let channel: ReturnType<Socket['channel']> | undefined
  void acquireSocket().then((s) => {
    if (closed) return releaseSocket()
    channel = s.channel(`user:${userId}`)
    for (const name of USER_EVENTS) channel.on(name, (payload) => onEvent(name, payload))
    channel.join().receive('ok', () => onEvent('joined', null))
  })
  return () => {
    if (closed) return
    closed = true
    if (channel) {
      channel.leave()
      releaseSocket()
    }
  }
}

/**
 * The MLS topic of one voice channel. `params` is called on every (re)join, so
 * each join carries a fresh key package.
 */
export const openVoiceTopic: OpenVoiceTopic = (channelId, params, handlers) => {
  let closed = false
  let channel: ReturnType<Socket['channel']> | undefined

  void acquireSocket().then((s) => {
    if (closed) return releaseSocket()
    const ch = s.channel(`voice:${channelId}`, params)
    channel = ch
    for (const event of [
      'create',
      'welcome',
      'commit',
      'commit_request',
      'reset',
      'superseded',
      'removed',
    ])
      ch.on(event, (payload) => handlers.event(event, payload))
    // The server ends the topic after reset/superseded/removed; never rejoin by ourselves then.
    ch.onClose(() => handlers.closed())
    ch.join()
      .receive('ok', (reply) => handlers.joined(reply))
      .receive('error', () => handlers.refused())
  })

  return {
    push: (event, payload) =>
      new Promise((resolve) => {
        if (!channel) return resolve(false)
        channel
          .push(event, payload)
          .receive('ok', () => resolve(true))
          .receive('error', () => resolve(false))
          .receive('timeout', () => resolve(false))
      }),
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
