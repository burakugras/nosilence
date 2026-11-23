// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it, vi } from 'vitest'
import { sharing } from './sharedConnections'
import type { CommunityListener, ConnectCommunity } from './types'

function fake() {
  const log: string[] = []
  let upstream: CommunityListener | undefined
  const connect: ConnectCommunity = (id, listener) => {
    log.push(`open ${id}`)
    upstream = listener
    return {
      setVoiceChannel: (channel) => log.push(`voice ${channel}`),
      close: () => log.push(`close ${id}`),
    }
  }
  return { connect, log, upstream: () => upstream! }
}

const listener = (): CommunityListener => ({
  presence: vi.fn(),
  event: vi.fn(),
  joined: vi.fn(),
  removed: vi.fn(),
})

describe('shared community connections', () => {
  it('the page and the call use one connection; it closes after the last user', () => {
    const { connect, log } = fake()
    const shared = sharing(connect)
    const page = shared('c1', listener())
    const call = shared('c1', listener())
    expect(log).toEqual(['open c1'])

    page.close()
    expect(log).toEqual(['open c1'])
    call.close()
    expect(log).toEqual(['open c1', 'close c1'])
  })

  it('events reach everyone; a late user gets the presence it missed', async () => {
    const { connect, upstream } = fake()
    const shared = sharing(connect)
    const page = listener()
    shared('c1', page)
    upstream().joined()
    upstream().presence([{ id: 'u1', display_name: 'A', voice_channel_id: null }])

    const call = listener()
    shared('c1', call)
    await Promise.resolve()
    expect(call.presence).toHaveBeenCalledWith([
      { id: 'u1', display_name: 'A', voice_channel_id: null },
    ])
    expect(call.joined).toHaveBeenCalled()

    upstream().removed()
    expect(page.removed).toHaveBeenCalled()
    expect(call.removed).toHaveBeenCalled()
  })

  it('closing the call clears the voice channel even while the page stays', () => {
    const { connect, log } = fake()
    const shared = sharing(connect)
    shared('c1', listener())
    const call = shared('c1', listener())
    call.setVoiceChannel('v1')
    call.close()
    expect(log).toEqual(['open c1', 'voice v1', 'voice null'])
  })
})
