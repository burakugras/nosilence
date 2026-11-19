// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import type { VoiceJoin } from '../api/voice'
import { CommunityPage } from './CommunityPage'

// Plain functions instead of vi.fn for anything that may reject (see RegisterPage.test.tsx).
let role: 'owner' | 'member' = 'owner'
vi.mock('../api/communities', () => ({
  getCommunity: () =>
    Promise.resolve({
      community: { id: 'c1', name: 'Ekip', role },
      channels: [{ id: 'ch1', name: 'General', kind: 'voice', capacity: 8 }],
    }),
  listMembers: () =>
    Promise.resolve([
      { user_id: 'u1', display_name: 'Burak', role: 'owner' },
      { user_id: 'u2', display_name: 'Ayşe', role: 'member' },
    ]),
  listInvites: () => Promise.resolve([]),
}))

describe('CommunityPage', () => {
  beforeEach(() => {
    role = 'owner'
  })

  it('owners see channel, invite and delete controls', async () => {
    render(<CommunityPage communityId="c1" />)

    expect(await screen.findByRole('heading', { name: 'Ekip' })).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New voice channel' })).toBeInTheDocument()
    expect(screen.getByRole('form', { name: 'New invite' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete this community' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })

  it('members see neither invite nor channel controls, and can leave', async () => {
    role = 'member'
    render(<CommunityPage communityId="c1" />)

    expect(await screen.findByRole('heading', { name: 'Ekip' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'New invite' })).toBeNull()
    expect(screen.queryByRole('form', { name: 'New voice channel' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Leave this community' })).toBeInTheDocument()
    expect(await screen.findByText('Ayşe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })

  it('shows the server message when a channel is full', async () => {
    const join = (): Promise<VoiceJoin> =>
      Promise.reject(new ApiError('this voice channel is full', 409))
    render(<CommunityPage communityId="c1" join={join} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Join' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('this voice channel is full')
  })
})
