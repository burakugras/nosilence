// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommunityListener, ConnectCommunity } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { VoicePanel } from '../layout/VoicePanel'
import { navigate } from '../router'
import { ActiveCall } from './ActiveCall'
import { endCall, startCall } from './call'
import { reportCall, resetControlsForTests } from './callState'

// The real room needs LiveKit; this stand-in only reports "connected".
vi.mock('./VoiceRoom', () => ({
  VoiceRoom: ({ onConnected }: { onConnected: () => void }) => {
    queueMicrotask(onConnected)
    return null
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

function renderCall() {
  const g = gateway()
  render(
    <GatewayContext.Provider value={g.connect}>
      <aside className="sidebar">
        <VoicePanel />
      </aside>
      <ActiveCall />
    </GatewayContext.Provider>,
  )
  return g
}

describe('the ongoing call', () => {
  afterEach(() => {
    act(endCall)
    resetControlsForTests()
    window.history.replaceState(null, '', '/')
  })

  it('keeps going while the user moves to other pages; Leave ends it', async () => {
    const { log } = renderCall()
    act(() => startCall(call))
    const panel = screen.getByRole('region', { name: 'Voice call' })
    expect(within(panel).getByRole('button', { name: 'Connecting…: General / Ekip' })).toBeTruthy()
    await vi.waitFor(() => expect(log).toEqual(['open c1', 'voice v1']))

    act(() => navigate('/settings'))
    expect(screen.getByRole('region', { name: 'Voice call' })).toBeInTheDocument()
    expect(log).toEqual(['open c1', 'voice v1'])

    fireEvent.click(screen.getByRole('button', { name: 'Leave call' }))
    expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull()
    expect(log).toEqual(['open c1', 'voice v1', 'voice null', 'close c1'])
  })

  it('"Voice connected" shows the connection and the verification code in a bubble', async () => {
    renderCall()
    act(() => startCall(call))
    act(() =>
      reportCall({
        status: { state: 'secured', epoch: 1, members: ['u1', 'u2'], code: '12345 67890' },
        rttMs: 42,
        lossRate: 0.004,
      }),
    )
    const info = screen.getByRole('button', { name: 'Voice connected: General / Ekip' })
    fireEvent.mouseEnter(info)
    const bubble = screen.getByRole('tooltip')
    expect(bubble).toHaveTextContent('Good connection')
    expect(bubble).toHaveTextContent('42 ms')
    expect(bubble).toHaveTextContent('0.4 %')
    expect(bubble).toHaveTextContent('12345 67890')
    fireEvent.mouseLeave(info)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('a call that could not be encrypted says so and can be left', () => {
    renderCall()
    act(() => startCall(call))
    act(() => reportCall({ status: { state: 'ended', reason: 'failed' } }))
    expect(screen.getByText(/could not be encrypted/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave call' }))
    expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull()
  })

  it('ends when the user is removed from the community', async () => {
    const { listeners } = renderCall()
    act(() => startCall(call))
    await vi.waitFor(() => expect(listeners).toHaveLength(1))
    act(() => listeners[0].removed())
    expect(screen.queryByRole('region', { name: 'Voice call' })).toBeNull()
  })
})
