// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useMemo, useState } from 'react'

type EmojiGroup = { name: string; emoji: [string, string][] }

// The full list (Unicode Emoji 12.0, ~47 KB) loads the first time it is opened.
let groupsPromise: Promise<EmojiGroup[]> | undefined
const loadGroups = () =>
  (groupsPromise ??= import('./emojiData.json').then((m) => m.default.groups as EmojiGroup[]))

const GROUP_ICON: Record<string, string> = {
  'Smileys & Emotion': '😀',
  'People & Body': '👋',
  'Animals & Nature': '🐻',
  'Food & Drink': '🍔',
  'Travel & Places': '✈️',
  Activities: '⚽',
  Objects: '💡',
  Symbols: '❤️',
  Flags: '🏁',
}

const MAX_RESULTS = 120

/**
 * Every emoji the server accepts, by group, with a search by English name.
 * Only one group (or the search results) is drawn at a time.
 */
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [groups, setGroups] = useState<EmojiGroup[]>()
  const [group, setGroup] = useState(0)
  const [query, setQuery] = useState('')

  useEffect(() => {
    let live = true
    void loadGroups().then((g) => live && setGroups(g))
    return () => {
      live = false
    }
  }, [])

  const shown = useMemo(() => {
    if (!groups) return []
    const q = query.trim().toLowerCase()
    if (!q) return groups[group]?.emoji ?? []
    return groups
      .flatMap((g) => g.emoji)
      .filter(([, name]) => name.includes(q))
      .slice(0, MAX_RESULTS)
  }, [groups, group, query])

  return (
    <div className="emoji-picker">
      <input
        type="search"
        aria-label="Search emoji"
        placeholder="Search emoji"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {!query && groups && (
        <div className="emoji-groups" role="tablist" aria-label="Emoji groups">
          {groups.map((g, i) => (
            <button
              key={g.name}
              type="button"
              role="tab"
              aria-selected={i === group}
              aria-label={g.name}
              title={g.name}
              onClick={() => setGroup(i)}
            >
              {GROUP_ICON[g.name] ?? g.emoji[0]?.[0]}
            </button>
          ))}
        </div>
      )}
      <div className="emoji-grid" aria-label={query ? 'Results' : groups?.[group]?.name}>
        {!groups ? (
          <p className="muted" role="status">
            Loading…
          </p>
        ) : shown.length === 0 ? (
          <p className="muted">No emoji found.</p>
        ) : (
          shown.map(([emoji, name]) => (
            <button
              key={emoji}
              type="button"
              aria-label={name}
              title={name}
              onClick={() => onPick(emoji)}
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
