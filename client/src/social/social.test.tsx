// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '../api/conversations'
import { emitUserEventForTests } from '../gateway/userLive'
import { ChooseUsernamePage } from './ChooseUsernamePage'
import { ConversationPage } from './ConversationPage'
import { refreshConversations } from './conversationsStore'
import { FriendsPage } from './FriendsPage'

const calls: string[] = []
const friends = {
  friends: [{ id: 'u2', display_name: 'Ayşe', username: 'ayse' }],
  incoming: [{ id: 'u3', display_name: 'Cem', username: 'cem' }],
  outgoing: [],
  blocked: [],
}

vi.mock('../api/social', () => ({
  setUsername: (name: string) => {
    calls.push(`username ${name}`)
    return Promise.resolve({ id: 'u1', email: 'b@x', display_name: 'Burak', username: name })
  },
  listFriends: () => Promise.resolve(friends),
  requestFriend: (target: { username: string }) => {
    calls.push(`request ${target.username}`)
    return Promise.resolve('requested')
  },
  acceptFriend: (id: string) => {
    calls.push(`accept ${id}`)
    return Promise.resolve()
  },
  removeFriend: () => Promise.resolve(),
  blockUser: (id: string) => {
    calls.push(`block ${id}`)
    return Promise.resolve()
  },
  unblockUser: () => Promise.resolve(),
}))

const direct: ConversationSummary = {
  id: 'd1',
  kind: 'direct',
  name: null,
  owner_id: null,
  members: [
    { id: 'u1', display_name: 'Burak', username: 'burak' },
    { id: 'u2', display_name: 'Ayşe', username: 'ayse' },
  ],
  last_message_at: null,
  unread: 0,
}

vi.mock('../api/conversations', async (original) => ({
  ...(await original<typeof import('../api/conversations')>()),
  listConversations: () => Promise.resolve([direct]),
  openDirect: () => Promise.resolve('d1'),
  conversationApi: {
    list: () =>
      Promise.resolve({
        messages: [
          {
            id: 'm1',
            seq: 1,
            channel_id: 'd1',
            text: 'selam',
            author: { id: 'u2', display_name: 'Ayşe' },
            inserted_at: '2026-11-26T10:00:00Z',
          },
        ],
        has_more: false,
        read: { message_id: 'm1', seq: 1 },
      }),
    send: () => Promise.reject(new Error('not used')),
    edit: () => Promise.reject(new Error('not used')),
    remove: () => Promise.resolve(),
    markRead: () => Promise.resolve(),
  },
}))

describe('social pages', () => {
  beforeEach(() => {
    calls.length = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('a username is checked before it is sent', async () => {
    const onDone = vi.fn()
    render(
      <ChooseUsernamePage
        user={{ id: 'u1', email: 'b@x', display_name: 'Burak' }}
        onDone={onDone}
      />,
    )
    const field = screen.getByLabelText('Username')
    fireEvent.change(field, { target: { value: 'a..b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))
    expect(
      await screen.findByText('No dot at the start or end, and not two in a row.'),
    ).toBeInTheDocument()
    expect(calls).toEqual([])

    fireEvent.change(field, { target: { value: 'Burak.U' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save username' }))
    await vi.waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(calls).toEqual(['username Burak.U'])
  })

  it('friends: add by username, accept, block', async () => {
    render(<FriendsPage />)
    const incoming = await screen.findByRole('list', { name: 'Requests to you' })
    fireEvent.click(within(incoming).getByRole('button', { name: 'Accept' }))

    fireEvent.change(screen.getByLabelText('Add a friend by username'), {
      target: { value: '@deniz' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    expect(await screen.findByText('Request sent.')).toBeInTheDocument()

    const list = screen.getByRole('list', { name: 'Friends (1)' })
    fireEvent.click(within(list).getByRole('button', { name: 'Block' }))
    await vi.waitFor(() => expect(calls).toEqual(['accept u3', 'request deniz', 'block u2']))
  })

  it('a conversation shows its messages, live ones, and that it is not end-to-end encrypted', async () => {
    await refreshConversations(() => Promise.resolve([direct]))
    render(<ConversationPage id="d1" currentUserId="u1" />)
    expect(await screen.findByText('selam')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ayşe' })).toBeInTheDocument()
    expect(screen.getByText(/not end-to-end encrypted/)).toBeInTheDocument()

    act(() =>
      emitUserEventForTests('dm_created', {
        id: 'm2',
        seq: 2,
        conversation_id: 'd1',
        text: 'nasılsın?',
        author: { id: 'u2', display_name: 'Ayşe' },
        inserted_at: '2026-11-26T10:01:00Z',
      }),
    )
    expect(await screen.findByText('nasılsın?')).toBeInTheDocument()

    // Another conversation's message does not show here.
    act(() =>
      emitUserEventForTests('dm_created', {
        id: 'm3',
        seq: 3,
        conversation_id: 'other',
        text: 'başka',
        author: { id: 'u3', display_name: 'Cem' },
        inserted_at: '2026-11-26T10:02:00Z',
      }),
    )
    expect(screen.queryByText('başka')).toBeNull()
  })
})
