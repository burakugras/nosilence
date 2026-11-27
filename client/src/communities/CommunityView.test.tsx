// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import type { Message } from '../api/messages'
import type { CommunityListener, ConnectCommunity } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { AppLayout } from '../layout/AppLayout'
import { closeDialog } from '../settings/settingsDialog'

// Addresses hold real ids (UUIDs).
const C = '0c100000-0000-4000-8000-000000000001'
const VOICE = '0c400000-0000-4000-8000-000000000001'
const T1 = '07100000-0000-4000-8000-000000000001'
const T2 = '07200000-0000-4000-8000-000000000002'
const T3 = '07300000-0000-4000-8000-000000000003'

// Plain functions instead of vi.fn for anything that may reject (see RegisterPage.test.tsx).
let role: 'owner' | 'member' = 'owner'
const extraMembers: { user_id: string; display_name: string; role: 'member' }[] = []
vi.mock('../api/communities', () => ({
  getCommunity: () =>
    Promise.resolve({
      community: { id: C, name: 'Ekip', role },
      channels: [
        { id: VOICE, name: 'General', kind: 'voice', capacity: 8 },
        // The server still counts two mentions in the channel that opens first.
        { id: T1, name: 'general', kind: 'text', capacity: null, unread: 0, mentions: 2 },
        { id: T2, name: 'news', kind: 'text', capacity: null, unread: 4 },
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
  listCommunities: () => Promise.resolve([]),
}))

let joinError: ApiError | undefined
vi.mock('../api/voice', () => ({
  requestChannelJoin: () =>
    joinError ? Promise.reject(joinError) : new Promise(() => {}) /* never connects here */,
}))

const message = (id: string, text: string, authorId = 'u2'): Message => ({
  id,
  seq: id.length,
  channel_id: T1,
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
  reactToMessage: () => Promise.resolve(),
  listReactors: () => Promise.resolve({ names: [], total: 0 }),
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
  const state: { listener?: CommunityListener } = {}
  const connect: ConnectCommunity = (_id, listener) => {
    state.listener = listener
    queueMicrotask(() => listener.joined())
    return { setVoiceChannel: () => {}, close: () => {} }
  }
  return { connect, state }
}

const user = { id: 'u1', email: 'b@x', display_name: 'Burak', username: 'burak' }

function renderCommunity(path = `/c/${C}`) {
  const gateway = fakeGateway()
  render(
    <GatewayContext.Provider value={gateway.connect}>
      <AppLayout user={user} path={path} params={new URLSearchParams()} />
    </GatewayContext.Provider>,
  )
  return gateway
}

const communityMenu = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Ekip' }))
  return screen.getByRole('dialog', { name: 'Ekip menu' })
}

describe('a community', () => {
  beforeEach(() => {
    role = 'owner'
    joinError = undefined
    sent.length = 0
    extraMembers.length = 0
    stored.length = 0
    act(closeDialog)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('the owner runs it from the menu: settings with channels, members, invites, ownership', async () => {
    renderCommunity()
    const menu = await communityMenu()
    expect(within(menu).getByRole('button', { name: /Invite people/ })).toBeInTheDocument()
    expect(within(menu).getByRole('button', { name: /Delete community/ })).toBeInTheDocument()

    fireEvent.click(within(menu).getByRole('button', { name: /Community settings/ }))
    const settings = screen.getByRole('dialog', { name: 'Ekip' })
    for (const section of ['Overview', 'Channels', 'Members and roles', 'Invites', 'Ownership'])
      expect(within(settings).getByRole('button', { name: section })).toBeInTheDocument()

    fireEvent.click(within(settings).getByRole('button', { name: 'Channels' }))
    expect(within(settings).getByRole('form', { name: 'New channel' })).toBeInTheDocument()
    fireEvent.click(within(settings).getByRole('button', { name: 'Invites' }))
    expect(await within(settings).findByRole('form', { name: 'New invite' })).toBeInTheDocument()
  })

  it('a member can only leave; no management anywhere', async () => {
    role = 'member'
    renderCommunity()
    const menu = await communityMenu()
    expect(within(menu).getByRole('button', { name: /Leave community/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: /Community settings/ })).toBeNull()
    expect(within(menu).queryByRole('button', { name: /Invite people/ })).toBeNull()
  })

  it('shows the server message when a voice channel is full', async () => {
    joinError = new ApiError('this voice channel is full', 409)
    renderCommunity()
    fireEvent.click(await screen.findByRole('button', { name: 'Join General' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('this voice channel is full')
  })

  it('shows who is online and who is in each voice channel', async () => {
    const { state } = renderCommunity()
    await screen.findByRole('list', { name: 'Members offline' })

    act(() =>
      state.listener!.presence([
        {
          id: 'u1',
          display_name: 'Burak',
          voice_channel_id: null,
          avatar: null,
          status: 'online' as const,
          status_text: null,
          status_expires_at: null,
        },
        {
          id: 'u2',
          display_name: 'Ayşe',
          voice_channel_id: VOICE,
          avatar: null,
          status: 'online' as const,
          status_text: null,
          status_expires_at: null,
        },
      ]),
    )

    expect(screen.getByText('1/8')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: 'In General' })).getByText('Ayşe'),
    ).toBeInTheDocument()
    const online = screen.getByRole('list', { name: 'Members online' })
    expect(within(online).getByText('Ayşe')).toBeInTheDocument()
    expect(within(online).getByText('Burak')).toBeInTheDocument()
  })

  it('shows messages, live updates, and sends with Enter', async () => {
    const { state } = renderCommunity()
    expect(await screen.findByText('hello')).toBeInTheDocument()

    act(() =>
      state.listener!.event({ type: 'message_created', message: message('m333', 'live message') }),
    )
    expect(screen.getByText('live message')).toBeInTheDocument()

    act(() => state.listener!.event({ type: 'message_deleted', id: 'm1', channel_id: T1 }))
    expect(screen.queryByText('hello')).toBeNull()

    const box = screen.getByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: '  hi there  ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('hi there')).toBeInTheDocument()
    expect(sent).toEqual(['hi there'])
  })

  it('new members and channels appear without a reload', async () => {
    const { state } = renderCommunity()
    await within(await screen.findByRole('list', { name: 'Members offline' })).findByText('Ayşe')

    extraMembers.push({ user_id: 'u3', display_name: 'Cem', role: 'member' })
    act(() => state.listener!.event({ type: 'member_joined', user_id: 'u3', display_name: 'Cem' }))
    expect(
      await within(screen.getByRole('list', { name: 'Members offline' })).findByText('Cem'),
    ).toBeInTheDocument()

    act(() =>
      state.listener!.event({
        type: 'channel_created',
        channel: { id: T3, name: 'duyurular', kind: 'text', capacity: null },
      }),
    )
    expect(screen.getByRole('link', { name: '#duyurular' })).toBeInTheDocument()
  })

  it('a deleted account shows as "Deleted user" at once, or its messages go', async () => {
    const { state } = renderCommunity()
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
    const { state } = renderCommunity()
    expect(await screen.findByRole('link', { name: '#news, 4 unread' })).toBeInTheDocument()

    act(() =>
      state.listener!.event({
        type: 'message_created',
        message: { ...message('m55555', 'news!'), channel_id: T2 },
      }),
    )
    expect(screen.getByRole('link', { name: '#news, 5 unread' })).toBeInTheDocument()
    // The user's own messages elsewhere do not count.
    act(() =>
      state.listener!.event({
        type: 'message_created',
        message: { ...message('m666666', 'mine', 'u1'), channel_id: T2 },
      }),
    )
    expect(screen.getByRole('link', { name: '#news, 5 unread' })).toBeInTheDocument()
  })

  it("the open channel's mentions do not count; mentions elsewhere arrive live (ADR 0018)", async () => {
    const { state } = renderCommunity()
    expect(await screen.findByRole('link', { name: '#general' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    act(() =>
      state.listener!.event({
        type: 'message_created',
        message: { ...message('m77777', 'hey @me'), channel_id: T2, mentions: ['u1'] },
      }),
    )
    expect(screen.getByRole('link', { name: '#news, 1 mentions, 5 unread' })).toBeInTheDocument()
  })

  it('opens the text channel in the address', async () => {
    renderCommunity(`/c/${C}/${T2}`)
    expect(await screen.findByRole('textbox', { name: 'Message #news' })).toBeInTheDocument()
    // The open channel is marked; reading it clears its count.
    expect(screen.getByRole('link', { name: /^#news/ })).toHaveAttribute('aria-current', 'page')
  })

  it('a removed member sees "Community not found" at once', async () => {
    const { state } = renderCommunity()
    await screen.findByRole('button', { name: 'Ekip' })

    act(() => state.listener!.removed())
    expect(screen.getByRole('heading', { name: 'Community not found' })).toBeInTheDocument()
  })

  it('edits the user’s own message and shows others’ edits live', async () => {
    const { state } = renderCommunity()
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
