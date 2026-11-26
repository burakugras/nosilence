// SPDX-License-Identifier: AGPL-3.0-only
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyReaction } from '../communities/reactions'
import { mentionsIn, splitMentions, suggestions, typingMention } from '../communities/mentions'
import { toOnlineMember } from '../gateway/phoenixGateway'
import { placement } from '../ui/avatarImage'
import { startIdleWatch } from './idle'
import { endOf, liveStatusText, statusOf } from './status'

const people = [
  { id: 'a', username: 'ayse', display_name: 'Ayşe' },
  { id: 'c', username: 'cem.k', display_name: 'Cem' },
  { id: 'n', username: null, display_name: 'No username' },
]

describe('status', () => {
  it('several connections: do not disturb wins, idle only if all are, offline only if all are', () => {
    expect(statusOf([{ status: 'online', idle: true }, { status: 'online' }])).toBe('online')
    expect(statusOf([{ status: 'online', idle: true }])).toBe('idle')
    expect(statusOf([{ status: 'dnd', idle: true }])).toBe('dnd')
    expect(statusOf([{ status: 'offline' }])).toBe('offline')
    expect(statusOf([])).toBe('offline')
  })

  it('a presence entry becomes one member', () => {
    expect(
      toOnlineMember('u1', [
        { display_name: 'Ayşe', avatar: 2, status: 'online', idle: true, voice_channel_id: null },
        { display_name: 'Ayşe', avatar: 2, status: 'online', idle: true, voice_channel_id: 'v1' },
      ]),
    ).toEqual({
      id: 'u1',
      display_name: 'Ayşe',
      avatar: 2,
      status: 'idle',
      status_text: null,
      status_expires_at: null,
      voice_channel_id: 'v1',
    })
  })

  it('a status text disappears when it ends', () => {
    const now = Date.parse('2026-11-27T10:00:00Z')
    expect(liveStatusText('Away', '2026-11-27T11:00:00Z', now)).toBe('Away')
    expect(liveStatusText('Away', '2026-11-27T09:59:00Z', now)).toBeNull()
    expect(liveStatusText('Away', null, now)).toBe('Away')
    expect(liveStatusText('', null, now)).toBeNull()
  })

  it('when a status text ends', () => {
    const now = new Date(2026, 10, 27, 10, 30)
    expect(endOf('never', now)).toBeNull()
    expect(endOf('1h', now)).toBe(new Date(2026, 10, 27, 11, 30).toISOString())
    expect(endOf('today', now)).toBe(new Date(2026, 10, 27, 23, 59, 59).toISOString())
  })
})

describe('idle', () => {
  afterEach(() => vi.useRealTimers())

  it('after a while without input; back at the next input', () => {
    vi.useFakeTimers()
    const report = vi.fn()
    const stop = startIdleWatch(report, 1000)
    vi.advanceTimersByTime(999)
    expect(report).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(report).toHaveBeenLastCalledWith(true)
    window.dispatchEvent(new Event('keydown'))
    expect(report).toHaveBeenLastCalledWith(false)
    stop()
  })
})

describe('reactions', () => {
  it("others' changes count; the user's own are applied once", () => {
    let r = applyReaction([], { emoji: '👍', added: true, mine: false })
    expect(r).toEqual([{ emoji: '👍', count: 1, me: false }])
    r = applyReaction(r, { emoji: '👍', added: true, mine: true })
    expect(r).toEqual([{ emoji: '👍', count: 2, me: true }])
    // The server's event for the user's own reaction comes back: nothing changes.
    expect(applyReaction(r, { emoji: '👍', added: true, mine: true })).toBe(r)
    r = applyReaction(r, { emoji: '👍', added: false, mine: false })
    r = applyReaction(r, { emoji: '👍', added: false, mine: true })
    expect(r).toEqual([])
  })
})

describe('mentions', () => {
  it('finds the @word being typed', () => {
    expect(typingMention('hi @ay', 6)).toEqual({ start: 3, query: 'ay' })
    expect(typingMention('@', 1)).toEqual({ start: 0, query: '' })
    expect(typingMention('mail@example', 12)).toBeNull()
    expect(typingMention('hi @ayse there', 14)).toBeNull()
  })

  it('suggests people by username, then by name; everyone/here only when allowed', () => {
    expect(suggestions(people, 'a', false).map((s) => s.key)).toEqual(['a'])
    expect(suggestions(people, 'ce', false).map((s) => s.insert)).toEqual(['cem.k'])
    expect(suggestions(people, 'h', true).map((s) => s.key)).toEqual(['here'])
    expect(suggestions(people, 'h', false)).toEqual([])
    // Inside a username counts too, after the ones that start with it.
    expect(suggestions(people, 'e', true).map((s) => s.key)).toEqual(['everyone', 'a', 'c'])
    expect(suggestions(people, '', false)).toHaveLength(2)
  })

  it('works out who a text mentions', () => {
    expect(mentionsIn('hi @ayse and @cem.k!', people, false)).toEqual({
      mentions: ['a', 'c'],
      mention: null,
    })
    // Not part of a longer name or an email address.
    expect(mentionsIn('@ayse2 x@ayse', people, false).mentions).toEqual([])
    expect(mentionsIn('@everyone look', people, false).mention).toBeNull()
    expect(mentionsIn('@everyone look', people, true).mention).toBe('everyone')
    expect(mentionsIn('@here', people, true).mention).toBe('here')
  })

  it('cuts a text into plain parts and mentions', () => {
    expect(splitMentions('hi @ayse, and @cem.k', ['ayse', 'cem.k'], null)).toEqual([
      { text: 'hi ', mention: false },
      { text: '@ayse', mention: true },
      { text: ', and ', mention: false },
      { text: '@cem.k', mention: true },
    ])
    expect(splitMentions('@here now', [], 'here')).toEqual([
      { text: '@here', mention: true },
      { text: ' now', mention: false },
    ])
    expect(splitMentions('@ayse', [], null)).toEqual([{ text: '@ayse', mention: false }])
  })
})

describe('profile picture crop', () => {
  it('the photo always covers the frame', () => {
    // A wide photo: the height fills the frame, it can move sideways only.
    const p = placement(400, 200, 100, { zoom: 1, x: 500, y: 30 })
    expect(p.w).toBe(200)
    expect(p.h).toBe(100)
    expect(p.x).toBe(50)
    expect(p.y).toBe(0)
    expect(p.left).toBe(0)
  })
})
