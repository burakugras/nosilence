// SPDX-License-Identifier: AGPL-3.0-only
import type { Mentions } from '../api/messages'

/** Someone who can be mentioned with @username (ADR 0017). */
export type Mentionable = { id: string; username?: string | null; display_name: string }

// The @word being typed, right before the caret.
const TYPING = /(^|\s)@([a-z0-9_.]*)$/i

/** The @word being typed before `caret`, as `{ start, query }`, or null. */
export function typingMention(text: string, caret: number) {
  const match = TYPING.exec(text.slice(0, caret))
  if (!match) return null
  return { start: caret - match[2].length - 1, query: match[2].toLowerCase() }
}

/** Who to suggest for `query`: names that start with it first. */
export function suggestions(
  people: Mentionable[],
  query: string,
  canMentionEveryone: boolean,
  limit = 8,
): { key: string; insert: string; label: string; detail?: string }[] {
  const special = canMentionEveryone
    ? [
        { key: 'everyone', insert: 'everyone', label: '@everyone', detail: 'Everyone here' },
        { key: 'here', insert: 'here', label: '@here', detail: 'Everyone online' },
      ].filter((s) => s.insert.startsWith(query))
    : []
  const named = people
    .filter((p) => p.username)
    .map((p) => {
      const u = p.username!.toLowerCase()
      const d = p.display_name.toLowerCase()
      const rank = u.startsWith(query) ? 0 : d.startsWith(query) ? 1 : u.includes(query) ? 2 : -1
      return { p, rank }
    })
    .filter(({ rank }) => rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.p.username!.localeCompare(b.p.username!))
    .map(({ p }) => ({
      key: p.id,
      insert: p.username!,
      label: p.display_name,
      detail: `@${p.username}`,
    }))
  return [...special, ...named].slice(0, limit)
}

const mentioned = (text: string, word: string) =>
  new RegExp(`(^|\\s)@${word.replace(/\./g, '\\.')}(?![a-z0-9_.])`, 'i').test(text)

/**
 * The mentions to send with `text`: the people whose @username it contains, and
 * everyone/here if allowed. Worked out here, by the app that knows the text.
 */
export function mentionsIn(
  text: string,
  people: Mentionable[],
  canMentionEveryone: boolean,
): Mentions {
  const ids = people.filter((p) => p.username && mentioned(text, p.username)).map((p) => p.id)
  const mention = !canMentionEveryone
    ? null
    : mentioned(text, 'everyone')
      ? 'everyone'
      : mentioned(text, 'here')
        ? 'here'
        : null
  return { mentions: [...new Set(ids)].slice(0, 20), mention }
}

/**
 * The text cut into plain parts and mentions to highlight: @username of the
 * people the message mentions, and @everyone/@here when it did.
 */
export function splitMentions(
  text: string,
  names: string[],
  everyone: 'everyone' | 'here' | null | undefined,
): { text: string; mention: boolean }[] {
  const words = [...names, ...(everyone ? [everyone] : [])]
  if (words.length === 0) return [{ text, mention: false }]
  const alternatives = words
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .sort((a, b) => b.length - a.length)
    .join('|')
  const pattern = new RegExp(`(^|\\s)(@(?:${alternatives}))(?![a-z0-9_.])`, 'gi')
  const parts: { text: string; mention: boolean }[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[1].length
    if (start > last) parts.push({ text: text.slice(last, start), mention: false })
    parts.push({ text: match[2], mention: true })
    last = start + match[2].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: false })
  return parts
}
