// SPDX-License-Identifier: AGPL-3.0-only
import type { Reaction, Reactors } from '../api/messages'

/** Common reactions, one click away (ADR 0017). */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👀']

/**
 * A reaction someone added or removed. Applying the same change twice changes
 * nothing for the user's own reactions (the app already applied them before the
 * server's event came back); others' change the count.
 */
export function applyReaction(
  reactions: Reaction[],
  change: { emoji: string; added: boolean; mine: boolean },
): Reaction[] {
  const { emoji, added, mine } = change
  const current = reactions.find((r) => r.emoji === emoji)
  if (mine && current && current.me === added) return reactions
  if (mine && !current && !added) return reactions

  if (!current) return added ? [...reactions, { emoji, count: 1, me: mine }] : reactions

  const count = current.count + (added ? 1 : -1)
  if (count <= 0) return reactions.filter((r) => r.emoji !== emoji)
  return reactions.map((r) => (r.emoji === emoji ? { ...r, count, me: mine ? added : r.me } : r))
}

/** "Ayşe, Cem and 3 others" for the people behind a reaction. */
export function reactorsText({ names, total }: Reactors) {
  const shown = names.slice(0, 3)
  const rest = total - shown.length
  if (rest > 0) return `${shown.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}`
  return shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`
    : (shown[0] ?? '')
}
