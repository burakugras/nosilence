// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import type { Message } from '../api/messages'
import type { VoiceJoin } from '../api/voice'
import type { CommunityListener, ConnectCommunity } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { CommunityPage } from './CommunityPage'

// Plain functions instead of vi.fn for anything that may reject (see RegisterPage.test.tsx).
let role: 'owner' | 'member' = 'owner'
const extraMembers: { user_id: string; display_name: string; role: 'member' }[] = []
vi.mock('../api/communities', () => ({
  getCommunity: () =>
    Promise.resolve({
      community: { id: 'c1', name: 'Ekip', role },
      channels: [
        { id: 'ch1', name: 'General', kind: 'voice', capacity: 8 },
        { id: 't1', name: 'general', kind: 'text', capacity: null, unread: 0 },
        { id: 't2', name: 'news', kind: 'text', capacity: null, unread: 4 },
      ],
    }),
  listMembers: () =>
    Promise.resolve([
      { user_id: 'u1', display_name: 'Burak', role: 'owner' },
      { user_id: 'u2', display_name: 'Ayşe', role: 'member' },
      ...extraMembers,
    ]),
  listInvites: () => Promise.resolve([]),
  getTransfer: () => Promise.resolve({ transfer: null, handover_available_at: null }),
  listOffers: () => Promise.resolve([]),
}))

const message = (id: string, text: string, authorId = 'u2'): Message => ({
  id,
  seq: id.length,
  channel_id: 't1',
  text,
  author: { id: authorId, display_name: authorId === 'u1' ? 'Burak' : 'Ayşe' },
  inserted_at: `2026-11-19T10:00:0${id.length}.000000Z`,
})

const sent: string[] = []
// Messages the fake server also returns after a reconnect.
const stored: Message[] = []
vi.mock('../api/messages', () => ({
  listMessages: () =>
    Promise.resolve({
      messages: [message('m1', 'hello'), ...stored],
      has_more: false,
      read: { message_id: 'm1', seq: 2 },
    }),
  markRead: () => Promise.resolve(),
  sendMessage: (_channel: string, text: string) => {
    sent.push(text)
    return Promise.resolve({ ...message('m22', text, 'u1') })
  },
  deleteMessage: () => Promise.resolve(),
  editMessage: (id: string, text: string) =>
    Promise.resolve({
      ...message(id, text, 'u1'),
      edited_at: '2026-11-19T10:05:00.000000Z',
      edits_left: 0,
    }),
}))

/** A fake live connection the test drives by hand. */
function fakeGateway() {
  const state: { listener?: CommunityListener; voice: (string | null)[] } = { voice: [] }
  const connect: ConnectCommunity = (_id, listener) => {
    state.listener = listener
    queueMicrotask(() => listener.joined())
    return { setVoiceChannel: (id) => state.voice.push(id), close: () => {} }
  }
  return { connect, state }
}

function renderPage(gateway = fakeGateway(), join?: () => Promise<VoiceJoin>) {
  render(
    <GatewayContext.Provider value={gateway.connect}>
      <CommunityPage communityId="c1" currentUserId="u1" join={join} />
    </GatewayContext.Provider>,
  )
  return gateway
}

describe('CommunityPage', () => {
  beforeEach(() => {
    role = 'owner'
    sent.length = 0
    extraMembers.length = 0
    stored.length = 0
  })

  it('owners see channel, invite and delete controls', async () => {
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ekip' })).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New channel' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New invite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete this community' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('members see neither invite nor channel controls, and can leave', async () => {
    role = 'member'
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Ekip' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'New invite' })).toBeNull()
    expect(screen.queryByRole('form', { name: 'New channel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave this community' })).toBeInTheDocument()
    const members = await screen.findByRole('list', { name: 'Members' })
    expect(await within(members).findByText('Ayşe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('shows the server message when a channel is full', async () => {
    const join = (): Promise<VoiceJoin> =>
      Promise.reject(new ApiError('this voice channel is full', 409))
    renderPage(fakeGateway(), join)

    fireEvent.click(await screen.findByRole('button', { name: 'Join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('this voice channel is full')
  })

  it('shows who is online and who is in each voice channel', async () => {
    const { state } = renderPage()
    await within(await screen.findByRole('list', { name: 'Members' })).findByText('Ayşe')

    act(() =>
      state.listener!.presence([
        { id: 'u1', display_name: 'Burak', voice_channel_id: null },
        { id: 'u2', display_name: 'Ayşe', voice_channel_id: 'ch1' },
      ]),
    )

    const voice = screen.getByRole('list', { name: 'Voice channels' })
    expect(within(voice).getByText('· 1/8')).toBeInTheDocument()
    expect(within(voice).getByText(/Ayşe/)).toBeInTheDocument()
    expect(screen.getAllByRole('img', { name: 'online' })).toHaveLength(2)
  })

  it('shows messages, live updates, and sends with Enter', async () => {
    const { state } = renderPage()
    expect(await screen.findByText('hello')).toBeInTheDocument()

    act(() =>
      state.listener!.event({ type: 'message_created', message: message('m333', 'live message') }),
    )
    expect(screen.getByText('live message')).toBeInTheDocument()

    act(() => state.listener!.event({ type: 'message_deleted', id: 'm1', channel_id: 't1' }))
    expect(screen.queryByText('hello')).toBeNull()

    const box = screen.getByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: '  hi there  ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('hi there')).toBeInTheDocument()
    expect(sent).toEqual(['hi there'])
  })

  it('new members and channels appear without a reload', async () => {
    const { state } = renderPage()
    const members = await screen.findByRole('list', { name: 'Members' })
    await within(members).findByText('Ayşe')

    extraMembers.push({ user_id: 'u3', display_name: 'Cem', role: 'member' })
    act(() => state.listener!.event({ type: 'member_joined', user_id: 'u3', display_name: 'Cem' }))
    expect(await within(members).findByText('Cem')).toBeInTheDocument()

    act(() =>
      state.listener!.event({
        type: 'channel_created',
        channel: { id: 't3', name: 'duyurular', kind: 'text', capacity: null },
      }),
    )
    expect(screen.getByRole('button', { name: '#duyurular' })).toBeInTheDocument()
  })

  it('a deleted account shows as "Deleted user" at once, or its messages go', async () => {
    const { state } = renderPage()
    expect(await screen.findByText('hello')).toBeInTheDocument()

    act(() =>
      state.listener!.event({ type: 'account_deleted', user_id: 'u2', messages_deleted: false }),
    )
    expect(screen.getByText('Deleted user')).toBeInTheDocument()
    expect(screen.getByText('hello')).toBeInTheDocument()

    act(() =>
      state.listener!.event({ type: 'message_created', message: message('m4444', 'mine', 'u1') }),
    )
    act(() =>
      state.listener!.event({ type: 'account_deleted', user_id: 'u1', messages_deleted: true }),
    )
    expect(screen.queryByText('mine')).toBeNull()
    expect(screen.getByText('hello')).toBeInTheDocument()
  })

  it('the channel list shows unread counts and counts new messages elsewhere live', async () => {
    const { state } = renderPage()
    expect(await screen.findByLabelText('4 unread')).toHaveTextContent('4')

    act(() =>
      state.listener!.event({
        type: 'message_created',
        message: { ...message('m55555', 'news!'), channel_id: 't2' },
      }),
    )
    expect(screen.getByLabelText('5 unread')).toBeInTheDocument()
    // The user's own messages elsewhere do not count.
    act(() =>
      state.listener!.event({
        type: 'message_created',
        message: { ...message('m666666', 'mine', 'u1'), channel_id: 't2' },
      }),
    )
    expect(screen.getByLabelText('5 unread')).toBeInTheDocument()
  })

  it('a removed member sees "Community not found" at once', async () => {
    const { state } = renderPage()
    await screen.findByRole('heading', { name: 'Ekip' })

    act(() => state.listener!.removed())
    expect(screen.getByRole('heading', { name: 'Community not found' })).toBeInTheDocument()
  })

  it('edits the user’s own message and shows others’ edits live', async () => {
    const { state } = renderPage()
    expect(await screen.findByText('hello')).toBeInTheDocument()
    // Only the author can edit.
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull()

    stored.push(message('m4444', 'mine', 'u1'))
    act(() => state.listener!.event({ type: 'message_created', message: stored[0] }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit message' }))
    const box = screen.getByRole('textbox', { name: 'Edit message' })
    fireEvent.change(box, { target: { value: 'mine, fixed' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    stored[0] = {
      ...stored[0],
      text: 'mine, fixed',
      edited_at: '2026-11-19T10:05:00.000000Z',
      edits_left: 0,
    }
    // A reconnect may re-render the list, so wait for the settled state.
    await vi.waitFor(() => {
      expect(screen.getByText('mine, fixed')).toBeInTheDocument()
      expect(screen.getByText('(edited)')).toBeInTheDocument()
    })

    act(() =>
      state.listener!.event({
        type: 'message_updated',
        message: { ...message('m1', 'hello again'), edited_at: '2026-11-19T10:06:00.000000Z' },
      }),
    )
    expect(screen.getByText('hello again')).toBeInTheDocument()
    expect(screen.getAllByText('(edited)')).toHaveLength(2)
    // Three edits used: no more Edit button.
    expect(screen.queryByRole('button', { name: 'Edit message' })).toBeNull()
  })
})
