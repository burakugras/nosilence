// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The user's conversations (ADR 0015), for the messages page and the unread
 * badge in the header. Reloaded when the user's topic says something changed.
 */
import { useSyncExternalStore } from 'react'
import { listConversations, type ConversationSummary } from '../api/conversations'
import { onUserEvent } from '../gateway/userLive'

let list: ConversationSummary[] | undefined
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

function set(next: ConversationSummary[] | undefined) {
  list = next
  listeners.forEach((l) => l())
}

export async function refreshConversations(load = listConversations) {
  try {
    set(await load())
  } catch {
    // Offline for a moment: keep what we have; the next event reloads.
  }
}

/** Several events in a row (a burst of messages) cause one reload. */
export function refreshSoon() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void refreshConversations(), 300)
}

/** While signed in: keep the list current. Returns a stop function. */
export function followConversations(): () => void {
  void refreshConversations()
  const stop = onUserEvent((event) => {
    if (event === 'dm_created' || event === 'conversation_changed' || event === 'joined')
      refreshSoon()
  })
  return () => {
    stop()
    if (timer) clearTimeout(timer)
    set(undefined)
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useConversations = () => useSyncExternalStore(subscribe, () => list)

export const totalUnread = (conversations: ConversationSummary[] | undefined) =>
  (conversations ?? []).reduce((sum, c) => sum + c.unread, 0)

/** A group's name, or the other people's names. */
export function conversationTitle(c: ConversationSummary, currentUserId: string) {
  if (c.name) return c.name
  const others = c.members.filter((m) => m.id !== currentUserId)
  if (others.length === 0) return 'Deleted user'
  return others.map((m) => m.display_name).join(', ')
}
