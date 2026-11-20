// SPDX-License-Identifier: AGPL-3.0-only
import type { Message, MessagePage } from '../api/messages'

export type History = { messages: Message[]; hasMore: boolean }

// The server's sequence number decides; time and id only for messages without one.
const byTime = (a: Message, b: Message) =>
  (a.seq ?? 0) - (b.seq ?? 0) ||
  a.inserted_at.localeCompare(b.inserted_at) ||
  a.id.localeCompare(b.id)

/** Adds messages that are not there yet and keeps the list in time order. */
export function merge(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map(current.map((m) => [m.id, m]))
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort(byTime)
}

/**
 * Combines what we have with a freshly loaded latest page (after a reconnect).
 * The page is the truth for the time it covers, so messages deleted while we
 * were offline disappear. If the page does not reach back to what we have,
 * there is a gap: start again from the page.
 */
export function reconcile(current: History | undefined, page: MessagePage): History {
  const fresh = { messages: page.messages, hasMore: page.has_more }
  if (!current || page.messages.length === 0) return fresh
  const ids = new Set(page.messages.map((m) => m.id))
  const overlaps = !page.has_more || current.messages.some((m) => ids.has(m.id))
  if (!overlaps) return fresh
  const oldest = page.messages[0]
  const older = current.messages.filter((m) => byTime(m, oldest) < 0)
  return { messages: merge(older, page.messages), hasMore: current.hasMore }
}
