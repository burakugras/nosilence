// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import type { LiveEvent } from '../gateway/types'
import { TextChannel } from './TextChannel'

const msg = (n: number, author = 'u2'): Message => ({
  id: `m${String(n).padStart(3, '0')}`,
  seq: n,
  channel_id: 't1',
  text: `message ${n}`,
  author: { id: author, display_name: author },
  inserted_at: `2026-11-20T10:00:${String(n).padStart(2, '0')}.000000Z`,
})

vi.mock('../api/messages', () => ({
  // By default the reader had read everything (up to message 2).
  listMessages: () =>
    Promise.resolve({
      messages: [msg(1), msg(2), ...(readUpTo < 2 ? [] : [])],
      has_more: false,
      read: { message_id: `m00${readUpTo}`, seq: readUpTo },
    }),
  markRead: (_channel: string, id: string) => {
    marked.push(id)
    return Promise.resolve()
  },
  sendMessage: (_c: string, text: string) => Promise.resolve({ ...msg(50, 'u1'), text }),
  deleteMessage: () => Promise.resolve(),
  editMessage: () => Promise.reject(new Error('not used here')),
}))

// jsdom has no layout. From the start, every list is 100 px tall and each
// message 100 px high, placed 100 px below the previous one.
beforeAll(() => {
  const define = (name: string, get: (this: HTMLElement) => number) =>
    Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get })
  define('offsetTop', function () {
    return this.tagName === 'LI' ? [...this.parentElement!.children].indexOf(this) * 100 : 0
  })
  define('offsetHeight', function () {
    return this.tagName === 'LI' ? 100 : 0
  })
  define('clientHeight', function () {
    return this.tagName === 'OL' ? 100 : 0
  })
  define('scrollHeight', function () {
    return this.tagName === 'OL' ? this.querySelectorAll('li').length * 100 : 0
  })
})

let readUpTo = 2
const marked: string[] = []

async function setup() {
  let handler: (e: LiveEvent) => void = () => {}
  const live = {
    generation: 1,
    subscribe: (h: (e: LiveEvent) => void) => {
      handler = h
      return () => {}
    },
  }
  render(
    <TextChannel
      channel={{ id: 't1', name: 'general' }}
      currentUserId="u1"
      canDeleteAny={false}
      live={live}
    />,
  )
  const list = await screen.findByRole('list', { name: 'Messages' })
  return { list, emit: (e: LiveEvent) => act(() => handler(e)) }
}

describe('TextChannel scrolling', () => {
  afterEach(() => {
    readUpTo = 2
    marked.length = 0
    vi.useRealTimers()
  })

  it('opens at the first message after where the reader stopped, and saves progress', async () => {
    readUpTo = 1
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { list } = await setup()
    const second = screen.getByText('message 2').closest('li')!
    expect(second).toHaveClass('unseen')
    expect(second).toHaveClass('first-unseen')

    // On screen: the tint fades and the read position moves to message 2.
    // The browser reports the opening scroll as a scroll event: it changes nothing.
    fireEvent.scroll(list)
    expect(second).toHaveClass('unseen')
    act(() => vi.advanceTimersByTime(3_100))
    expect(second).not.toHaveClass('unseen')
    // The "New" line stays a while to show where the reader stopped, then goes.
    expect(second).toHaveClass('first-unseen')
    act(() => vi.advanceTimersByTime(5_100))
    expect(second).not.toHaveClass('first-unseen')
    act(() => vi.advanceTimersByTime(1_000))
    expect(marked).toEqual(['m002'])
    expect(list).toBeInTheDocument()
  })

  it("never moves for others' messages, even at the bottom; announces those out of sight", async () => {
    const { list, emit } = await setup()
    // At the bottom: 2 messages of 100 px in a 100 px window.
    list.scrollTop = 100
    fireEvent.scroll(list)

    emit({ type: 'message_created', message: msg(3) })
    expect(list.scrollTop).toBe(100)
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
    expect(screen.getByText('message 3').closest('li')).toHaveClass('first-unseen')
  })

  it('leads to the first unseen message, not to the end', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    emit({ type: 'message_created', message: msg(4) })
    expect(list.scrollTop).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: '2 new messages ↓' }))
    expect(list.scrollTop).toBe(200)
    // Message 3 is now on screen; message 4 is still below, so one remains.
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
    expect(screen.getByText('message 3').closest('li')).toHaveClass('first-unseen')
  })

  it('does not announce a message that landed in sight', async () => {
    const { list, emit } = await setup()
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 1000 })
    emit({ type: 'message_created', message: msg(3) })
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
  })

  it('tints unseen messages until they have been on screen', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    emit({ type: 'message_created', message: msg(4) })
    const third = screen.getByText('message 3').closest('li')!
    const fourth = screen.getByText('message 4').closest('li')!
    expect(third).toHaveClass('unseen')
    expect(fourth).toHaveClass('unseen')

    // Scrolling so only message 3 is on screen: it turns normal, 4 stays tinted.
    list.scrollTop = 200
    fireEvent.scroll(list)
    expect(third).not.toHaveClass('unseen')
    expect(fourth).toHaveClass('unseen')
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
  })

  it('scrolling down to the bottom clears the strip and the tint, the line stays', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
    // The bottom: 3 messages of 100 px in a 100 px window.
    list.scrollTop = 200
    fireEvent.scroll(list)
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
    expect(screen.getByText('message 3').closest('li')).toHaveClass('first-unseen')
    expect(screen.getByText('message 3').closest('li')).not.toHaveClass('unseen')
  })

  it('always goes to the end after sending', async () => {
    const { list } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    const box = screen.getByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: 'mine' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await screen.findByText('mine')
    expect(list.scrollTop).toBe(300)
  })
})
