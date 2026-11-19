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
vi.mock('../api/communities', () => ({
  getCommunity: () =>
    Promise.resolve({
      community: { id: 'c1', name: 'Ekip', role },
      channels: [
        { id: 'ch1', name: 'General', kind: 'voice', capacity: 8 },
        { id: 't1', name: 'general', kind: 'text', capacity: null },
      ],
    }),
  listMembers: () =>
    Promise.resolve([
      { user_id: 'u1', display_name: 'Burak', role: 'owner' },
      { user_id: 'u2', display_name: 'Ayşe', role: 'member' },
    ]),
  listInvites: () => Promise.resolve([]),
}))

const message = (id: string, text: string, authorId = 'u2'): Message => ({
  id,
  channel_id: 't1',
  text,
  author: { id: authorId, display_name: authorId === 'u1' ? 'Burak' : 'Ayşe' },
  inserted_at: `2026-11-19T10:00:0${id.length}.000000Z`,
})

const sent: string[] = []
vi.mock('../api/messages', () => ({
  listMessages: () => Promise.resolve({ messages: [message('m1', 'merhaba')], has_more: false }),
  sendMessage: (_channel: string, text: string) => {
    sent.push(text)
    return Promise.resolve({ ...message('m22', text, 'u1') })
  },
  deleteMessage: () => Promise.resolve(),
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
    expect(await screen.findByText('merhaba')).toBeInTheDocument()

    act(() =>
      state.listener!.event({ type: 'message_created', message: message('m333', 'canlı mesaj') }),
    )
    expect(screen.getByText('canlı mesaj')).toBeInTheDocument()

    act(() => state.listener!.event({ type: 'message_deleted', id: 'm1', channel_id: 't1' }))
    expect(screen.queryByText('merhaba')).toBeNull()

    const box = screen.getByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: '  selam  ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText('selam')).toBeInTheDocument()
    expect(sent).toEqual(['selam'])
  })

  it('a removed member sees "Community not found" at once', async () => {
    const { state } = renderPage()
    await screen.findByRole('heading', { name: 'Ekip' })

    act(() => state.listener!.removed())
    expect(screen.getByRole('heading', { name: 'Community not found' })).toBeInTheDocument()
  })
})
