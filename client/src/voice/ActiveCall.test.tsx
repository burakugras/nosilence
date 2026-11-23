// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityListener, ConnectCommunity } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { navigate } from '../router'
import { ActiveCall } from './ActiveCall'
import { endCall, startCall } from './call'

// The real room needs LiveKit; this stand-in reports "connected" and can leave.
vi.mock('./VoiceRoom', () => ({
  VoiceRoom: ({
    title,
    onConnected,
    onLeave,
  }: {
    title: string
    onConnected: () => void
    onLeave: () => void
  }) => {
    queueMicrotask(onConnected)
    return (
      <div>
        <h2>{title}</h2>
        <button type="button" onClick={onLeave}>
          Leave
        </button>
      </div>
    )
  },
}))

function gateway() {
  const log: string[] = []
  const listeners: CommunityListener[] = []
  const connect: ConnectCommunity = (id, listener) => {
    log.push(`open ${id}`)
    listeners.push(listener)
    return {
      setVoiceChannel: (channel) => log.push(`voice ${channel}`),
      close: () => log.push(`close ${id}`),
    }
  }
  return { connect, log, listeners }
}

const call = {
  communityId: 'c1',
  communityName: 'Ekip',
  channel: { id: 'v1', name: 'General', kind: 'voice' as const, capacity: 8 },
  join: { url: 'ws://livekit', token: 't', room: 'v1', identity: 'u1' },
  startedAt: 0,
}

describe('ActiveCall', () => {
  afterEach(() => {
    act(endCall)
    window.history.replaceState(null, '', '/')
  })

  it('keeps the call while the user moves to other pages', async () => {
    const { connect, log } = gateway()
    window.history.replaceState(null, '', '/c/c1')
    render(
      <GatewayContext.Provider value={connect}>
        <ActiveCall />
      </GatewayContext.Provider>,
    )
    act(() => startCall(call))
    expect(await screen.findByRole('heading', { name: 'Ekip · General' })).toBeInTheDocument()
    await vi.waitFor(() => expect(log).toEqual(['open c1', 'voice v1']))
    expect(screen.queryByRole('link', { name: 'Open Ekip' })).toBeNull()

    act(() => navigate('/settings'))
    expect(screen.getByRole('heading', { name: 'Ekip · General' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Ekip' })).toBeInTheDocument()
    expect(log).toEqual(['open c1', 'voice v1'])

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    expect(screen.queryByRole('heading', { name: 'Ekip · General' })).toBeNull()
    expect(log).toEqual(['open c1', 'voice v1', 'voice null', 'close c1'])
  })

  it('ends when the user is removed from the community', async () => {
    const { connect, listeners } = gateway()
    render(
      <GatewayContext.Provider value={connect}>
        <ActiveCall />
      </GatewayContext.Provider>,
    )
    act(() => startCall(call))
    await screen.findByRole('heading', { name: 'Ekip · General' })
    act(() => listeners[0].removed())
    expect(screen.queryByRole('heading', { name: 'Ekip · General' })).toBeNull()
  })
})
