// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MembersSection } from './MembersSection'

const calls: string[] = []
vi.mock('../api/communities', () => ({
  listMembers: () =>
    Promise.resolve([
      { user_id: 'u1', display_name: 'Burak', role: 'owner' },
      { user_id: 'u2', display_name: 'Ayşe', role: 'moderator' },
      { user_id: 'u3', display_name: 'Cem', role: 'member' },
    ]),
  setRole: (_c: string, user: string, role: string) => {
    calls.push(`${user}:${role}`)
    return Promise.resolve()
  },
  removeMember: (_c: string, user: string) => {
    calls.push(`remove:${user}`)
    return Promise.resolve()
  },
}))

vi.mock('../api/social', () => ({
  requestFriend: (target: { user_id: string }) => {
    calls.push(`friend:${target.user_id}`)
    return Promise.resolve('requested')
  },
}))
vi.mock('../api/conversations', () => ({ openDirect: () => Promise.resolve('d1') }))

const row = async (name: string) =>
  (await screen.findByText(name, { exact: false })).closest('li') as HTMLElement

describe('MembersSection', () => {
  beforeEach(() => {
    calls.length = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('the owner promotes, demotes and removes', async () => {
    render(<MembersSection communityId="c1" myRole="owner" online={new Set()} refreshKey={0} />)

    fireEvent.click(within(await row('Cem')).getByRole('button', { name: 'Make moderator' }))
    fireEvent.click(within(await row('Ayşe')).getByRole('button', { name: 'Remove moderator' }))
    fireEvent.click(within(await row('Ayşe')).getByRole('button', { name: 'Remove' }))
    await vi.waitFor(() => expect(calls).toEqual(['u3:moderator', 'u2:member', 'remove:u2']))
    expect(within(await row('Burak')).queryByRole('button')).toBeNull()
  })

  it('a moderator removes only members and cannot change roles', async () => {
    render(<MembersSection communityId="c1" myRole="moderator" online={new Set()} refreshKey={0} />)

    expect(within(await row('Cem')).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
    expect(within(await row('Ayşe')).queryByRole('button')).toBeNull()
    expect(within(await row('Burak')).queryByRole('button')).toBeNull()
    expect(screen.queryByRole('button', { name: /moderator/ })).toBeNull()
  })

  it('others can be messaged or added as friends, not the user', async () => {
    render(
      <MembersSection
        communityId="c1"
        currentUserId="u3"
        myRole="member"
        online={new Set()}
        refreshKey={0}
      />,
    )
    fireEvent.click(within(await row('Ayşe')).getByRole('button', { name: 'Add friend' }))
    expect(await screen.findByText('Friend request sent to Ayşe.')).toBeInTheDocument()
    expect(calls).toEqual(['friend:u2'])
    expect(within(await row('Cem')).queryByRole('button', { name: 'Message' })).toBeNull()
  })
})
