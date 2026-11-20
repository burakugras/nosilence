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

// jsdom has no layout: give the list a fixed size that grows with each message.
function fakeLayout(el: HTMLElement) {
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
  it('follows new messages while the reader is at the bottom', async () => {
    const { list, emit } = await setup()
    emit({ type: 'message_created', message: msg(3) })
    expect(list.scrollTop).toBe(300)
  })

  it('leaves the view alone while the reader is further up, and says what is new', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    expect(list.scrollTop).toBe(0)
    emit({ type: 'message_created', message: msg(4) })
    expect(screen.getByRole('button', { name: '2 new messages ↓' })).toBeInTheDocument()

    // Jumping to the latest clears it.
    fireEvent.click(screen.getByRole('button', { name: '2 new messages ↓' }))
    expect(list.scrollTop).toBe(400)
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
  })

  it('scrolling down to the bottom clears the strip', async () => {
    const { list, emit } = await setup()
    list.scrollTop = 0
    fireEvent.scroll(list)
    emit({ type: 'message_created', message: msg(3) })
    expect(screen.getByRole('button', { name: '1 new message ↓' })).toBeInTheDocument()
    list.scrollTop = 200
    fireEvent.scroll(list)
    expect(screen.queryByRole('button', { name: /new message/ })).toBeNull()
  })

  it('always goes to the bottom after sending', async () => {
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
