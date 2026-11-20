// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import type { Message } from '../api/messages'
import { merge, reconcile } from './messageHistory'

const m = (n: number): Message => ({
  id: `id-${String(n).padStart(3, '0')}`,
  seq: n,
  channel_id: 't1',
  text: `m${n}`,
  author: null,
  inserted_at: `2026-11-19T10:00:${String(n).padStart(2, '0')}.000000Z`,
})
const texts = (ms: Message[]) => ms.map((x) => x.text)

describe('message history', () => {
  it('merge keeps time order and drops duplicates', () => {
    expect(texts(merge([m(1), m(3)], [m(2), m(3)]))).toEqual(['m1', 'm2', 'm3'])
  })

  it('after a reconnect, adds missed messages and drops ones deleted meanwhile', () => {
    const current = { messages: [m(1), m(2), m(3), m(4)], hasMore: true }
    const page = { messages: [m(2), m(4), m(5)], has_more: true }
    // m3 was deleted while offline; m1 is older than the page and stays.
    expect(texts(reconcile(current, page).messages)).toEqual(['m1', 'm2', 'm4', 'm5'])
    expect(reconcile(current, page).hasMore).toBe(true)
  })

  it('starts again from the latest page when too much was missed', () => {
    const current = { messages: [m(1), m(2)], hasMore: false }
    const page = { messages: [m(10), m(11)], has_more: true }
    expect(reconcile(current, page)).toEqual({ messages: [m(10), m(11)], hasMore: true })
  })

  it('an empty channel empties the list', () => {
    expect(
      reconcile({ messages: [m(1)], hasMore: false }, { messages: [], has_more: false }),
    ).toEqual({ messages: [], hasMore: false })
  })
})
