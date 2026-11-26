// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Message } from '../api/messages'
import type { LiveEvent } from '../gateway/types'
import { TextChannel, type MessageApi } from './TextChannel'

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  seq: 1,
  channel_id: 't1',
  text: 'hi @ayse, look',
  author: { id: 'c', display_name: 'Cem', avatar: null },
  inserted_at: '2026-11-27T10:00:00Z',
  mentions: ['a'],
  mention: null,
  reactions: [{ emoji: '👍', count: 2, me: true }],
  ...over,
})

const people = [
  { id: 'a', username: 'ayse', display_name: 'Ayşe' },
  { id: 'c', username: 'cem', display_name: 'Cem' },
]

function setup(messages: Message[] = [message()]) {
  const handlers = new Set<(e: LiveEvent) => void>()
  const api = {
    list: vi.fn(() => Promise.resolve({ messages, has_more: false, read: null })),
    send: vi.fn((_id: string, text: string) =>
      Promise.resolve(
        message({ id: 'm2', seq: 2, text, author: { id: 'a', display_name: 'Ayşe' } }),
      ),
    ),
    edit: vi.fn(),
    remove: vi.fn(),
    markRead: vi.fn(() => Promise.resolve()),
    react: vi.fn(() => Promise.resolve()),
  } as unknown as MessageApi & { react: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> }
  render(
    <TextChannel
      channel={{ id: 't1', name: 'general' }}
      api={api}
      currentUserId="a"
      canDeleteAny={false}
      live={{
        generation: 1,
        subscribe: (h) => {
          handlers.add(h)
          return () => handlers.delete(h)
        },
      }}
      people={people}
    />,
  )
  const emit = (e: LiveEvent) => act(() => handlers.forEach((h) => h(e)))
  return { api, emit }
}

describe('reactions and mentions in the chat (ADR 0017)', () => {
  it('a message that mentions the reader stands out, with the @name highlighted', async () => {
    setup()
    const text = await screen.findByText('@ayse')
    expect(text).toHaveClass('mention')
    expect(text.closest('li')).toHaveClass('mentions-me')
  })

  it('a reaction toggles at once; others’ reactions arrive live', async () => {
    const { api, emit } = setup()
    const mine = await screen.findByRole('button', { name: '👍 2, including you' })
    fireEvent.click(mine)
    expect(await screen.findByRole('button', { name: '👍 1' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(api.react).toHaveBeenCalledWith('m1', '👍', false)

    emit({
      type: 'reaction_changed',
      message_id: 'm1',
      channel_id: 't1',
      emoji: '🎉',
      user_id: 'c',
      added: true,
    })
    expect(screen.getByRole('button', { name: '🎉 1' })).toBeInTheDocument()
  })

  it('React opens the quick reactions', async () => {
    const { api } = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Add reaction' }))
    const picker = screen.getByRole('dialog', { name: 'Add reaction' })
    fireEvent.click(within(picker).getByRole('button', { name: 'React with 🔥' }))
    expect(api.react).toHaveBeenCalledWith('m1', '🔥', true)
    expect(screen.queryByRole('dialog', { name: 'Add reaction' })).toBeNull()
    expect(screen.getByRole('button', { name: '🔥 1, including you' })).toBeInTheDocument()
  })

  it('a refused reaction is taken back and explained', async () => {
    const { api } = setup()
    api.react.mockRejectedValueOnce(new Error('nope'))
    fireEvent.click(await screen.findByRole('button', { name: '👍 2, including you' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '👍 2, including you' })).toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the reaction.')
  })

  it('typing @ suggests people; the pick goes into the text and is sent as a mention', async () => {
    const { api } = setup([])
    const box = await screen.findByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: 'hey @ce', selectionStart: 7 } })
    const list = screen.getByRole('listbox', { name: 'Mention someone' })
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box).toHaveValue('hey @cem ')
    expect(screen.queryByRole('listbox')).toBeNull()

    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' })
    })
    expect(api.send).toHaveBeenCalledWith('t1', 'hey @cem', { mentions: ['c'], mention: null })
  })
})
