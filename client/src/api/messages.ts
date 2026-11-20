// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type Message = {
  id: string
  /** Order within the channel, assigned by the server. */
  seq: number
  channel_id: string
  text: string
  /** Null when the author's account was deleted. */
  author: { id: string; display_name: string } | null
  inserted_at: string
}

/** Where the user stopped reading the channel, or null if never. */
export type ReadPosition = { message_id: string; seq: number } | null

export type MessagePage = { messages: Message[]; has_more: boolean; read?: ReadPosition }

/** One page of history, oldest first; `before` is a message id for older pages. */
export const listMessages = (channelId: string, before?: string) =>
  request<MessagePage>(
    `/api/channels/${channelId}/messages` + (before ? `?before=${encodeURIComponent(before)}` : ''),
  )

export const sendMessage = async (channelId: string, text: string) =>
  (
    await request<{ message: Message }>(`/api/channels/${channelId}/messages`, {
      method: 'POST',
      body: { text },
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

export const deleteMessage = (id: string) =>
  request<void>(`/api/messages/${id}`, { method: 'DELETE' })

/** A 60-second ticket for opening the real-time connection. */
export const fetchSocketTicket = async () =>
  (await request<{ token: string }>('/api/socket-token', { method: 'POST' })).token
