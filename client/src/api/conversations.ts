// SPDX-License-Identifier: AGPL-3.0-only
import type { MessageApi } from '../communities/TextChannel'
import { request } from './http'
import type { Message, MessagePage } from './messages'
import type { Person } from './social'

export type ConversationSummary = {
  id: string
  kind: 'direct' | 'group'
  /** Groups only, optional. */
  name: string | null
  owner_id: string | null
  members: Person[]
  last_message_at: string | null
  /** Messages from others not read yet (up to 100). */
  unread: number
}

export const listConversations = async () =>
  (await request<{ conversations: ConversationSummary[] }>('/api/conversations')).conversations

/** The direct conversation with someone, created on first use. */
export const openDirect = async (userId: string) =>
  (
    await request<{ conversation: { id: string } }>('/api/conversations', {
      method: 'POST',
      body: { user_id: userId },
    })
  ).conversation.id

export const createGroup = async (memberIds: string[], name: string) =>
  (
    await request<{ conversation: { id: string } }>('/api/conversations', {
      method: 'POST',
      body: { member_ids: memberIds, name },
    })
  ).conversation.id

export const renameGroup = (id: string, name: string) =>
  request<void>(`/api/conversations/${id}`, { method: 'PATCH', body: { name } })

export const addMembers = (id: string, userIds: string[]) =>
  request<void>(`/api/conversations/${id}/members`, { method: 'POST', body: { user_ids: userIds } })

/** Leaving (own id), or the creator removing someone. */
export const removeMember = (id: string, userId: string) =>
  request<void>(`/api/conversations/${id}/members/${userId}`, { method: 'DELETE' })

/** A conversation message as the chat view expects (it keys messages by "channel"). */
export type ConversationMessage = Omit<Message, 'channel_id'> & { conversation_id: string }
export const asMessage = ({ conversation_id, ...m }: ConversationMessage): Message => ({
  ...m,
  channel_id: conversation_id,
})

/** The chat view's API for a conversation (same view as community text channels). */
export const conversationApi: MessageApi = {
  list: async (id, before) => {
    const page = await request<Omit<MessagePage, 'messages'> & { messages: ConversationMessage[] }>(
      `/api/conversations/${id}/messages` + (before ? `?before=${encodeURIComponent(before)}` : ''),
    )
    return { ...page, messages: page.messages.map(asMessage) }
  },
  // Conversations have no "everyone"/"here": only named people.
  send: async (id, text, { mentions } = {}) =>
    asMessage(
      (
        await request<{ message: ConversationMessage }>(`/api/conversations/${id}/messages`, {
          method: 'POST',
          body: { text, mentions },
        })
      ).message,
    ),
  edit: async (messageId, text, { mentions } = {}) =>
    asMessage(
      (
        await request<{ message: ConversationMessage }>(`/api/conversation-messages/${messageId}`, {
          method: 'PATCH',
          body: { text, mentions },
        })
      ).message,
    ),
  react: (messageId, emoji, add) =>
    request<void>(
      `/api/conversation-messages/${messageId}/reactions/${encodeURIComponent(emoji)}`,
      { method: add ? 'PUT' : 'DELETE' },
    ),
  remove: (messageId) =>
    request<void>(`/api/conversation-messages/${messageId}`, { method: 'DELETE' }),
  markRead: (id, messageId) =>
    request<void>(`/api/conversations/${id}/read`, {
      method: 'POST',
      body: { message_id: messageId },
    }),
}
