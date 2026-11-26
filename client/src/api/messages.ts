// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

/** One emoji on a message: how many put it there, and whether the user did. */
export type Reaction = { emoji: string; count: number; me: boolean }

/**
 * Who a message mentions (ADR 0017): ids the app picked out of the text, and
 * "everyone" or "here" (moderators and the owner). The server never reads the
 * text for them.
 */
export type Mentions = { mentions?: string[]; mention?: 'everyone' | 'here' | null }

export type Message = {
  id: string
  /** Order within the channel, assigned by the server. */
  seq: number
  channel_id: string
  text: string
  /** Null when the author's account was deleted. */
  author: { id: string; display_name: string; avatar?: number | null } | null
  mentions?: string[]
  mention?: 'everyone' | 'here' | null
  /** Null or missing in live events: keep the reactions already shown. */
  reactions?: Reaction[] | null
  inserted_at: string
  /** Set when the author edited the text. */
  edited_at?: string | null
  /** How many more times the author can edit it (at most three edits). */
  edits_left?: number
}

/** Where the user stopped reading the channel, or null if never. */
export type ReadPosition = { message_id: string; seq: number } | null

export type MessagePage = { messages: Message[]; has_more: boolean; read?: ReadPosition }

/** One page of history, oldest first; `before` is a message id for older pages. */
export const listMessages = (channelId: string, before?: string) =>
  request<MessagePage>(
    `/api/channels/${channelId}/messages` + (before ? `?before=${encodeURIComponent(before)}` : ''),
  )

export const sendMessage = async (channelId: string, text: string, mentions: Mentions = {}) =>
  (
    await request<{ message: Message }>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: { text, ...mentions },
    })
  ).message

/** Moves the user's read position forward to `messageId` (never back). */
export const markRead = (channelId: string, messageId: string) =>
  request<void>(`/api/channels/${channelId}/read`, {
    method: 'POST',
    body: { message_id: messageId },
    // Often sent while leaving the channel or closing the page.
    keepalive: true,
  })

export const editMessage = async (id: string, text: string, mentions: Mentions = {}) =>
  (
    await request<{ message: Message }>(`/api/messages/${id}`, {
      method: 'PATCH',
      body: { text, ...mentions },
    })
  ).message

/** Adds (`add`) or removes the user's `emoji` on a message. */
export const reactToMessage = (id: string, emoji: string, add: boolean) =>
  request<void>(`/api/messages/${id}/reactions/${encodeURIComponent(emoji)}`, {
    method: add ? 'PUT' : 'DELETE',
  })

export const deleteMessage = (id: string) =>
  request<void>(`/api/messages/${id}`, { method: 'DELETE' })

/** A 60-second ticket for opening the real-time connection. */
export const fetchSocketTicket = async () =>
  (await request<{ token: string }>('/api/socket-token', { method: 'POST' })).token
