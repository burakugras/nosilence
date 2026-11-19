// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type Message = {
  id: string
  channel_id: string
  text: string
  /** Null when the author's account was deleted. */
  author: { id: string; display_name: string } | null
  inserted_at: string
}

export type MessagePage = { messages: Message[]; has_more: boolean }

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

export const deleteMessage = (id: string) =>
  request<void>(`/api/messages/${id}`, { method: 'DELETE' })

/** A 60-second ticket for opening the real-time connection. */
export const fetchSocketTicket = async () =>
  (await request<{ token: string }>('/api/socket-token', { method: 'POST' })).token
