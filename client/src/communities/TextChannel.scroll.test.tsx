// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import type { LiveEvent } from '../gateway/types'
import { TextChannel } from './TextChannel'

const msg = (n: number, author = 'u2'): Message => ({
  id: `m${String(n).padStart(3, '0')}`,
  channel_id: 't1',
  text: `message ${n}`,
  author: { id: author, display_name: author },
  inserted_at: `2026-11-20T10:00:${String(n).padStart(2, '0')}.000000Z`,
})

vi.mock('../api/messages', () => ({
  listMessages: () => Promise.resolve({ messages: [msg(1), msg(2)], has_more: false }),
  sendMessage: (_c: string, text: string) => Promise.resolve({ ...msg(50, 'u1'), text }),
  deleteMessage: () => Promise.resolve(),
}))

// jsdom has no layout: give the list a fixed size that grows with each message,
// and each message a position 100 px below the previous one.
function fakeLayout(el: HTMLElement) {
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'LI' ? [...this.parentElement!.children].indexOf(this) * 100 : 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.tagName === 'LI' ? 100 : 0
    },
  })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: 100 })
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => el.querySelectorAll('li').length * 100,
  })
}

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
  fakeLayout(list)
  return { list, emit: (e: LiveEvent) => act(() => handler(e)) }
}

describe('TextChannel scrolling', () => {
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

  it('scrolling down to the bottom clears the strip and the mark', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
    // The bottom: 3 messages of 100 px in a 100 px window.
    list.scrollTop = 200
    fireEvent.scroll(list)
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
    expect(screen.getByText('message 3').closest('li')).not.toHaveClass('first-unseen')
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
