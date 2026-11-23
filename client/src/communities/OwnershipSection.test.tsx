// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OwnershipOffer, Transfer } from '../api/communities'
import { OwnershipSection } from './OwnershipSection'

let transfer: Transfer | null = null
let availableAt: string | null = null
let offers: OwnershipOffer[] = []
const calls: unknown[] = []
vi.mock('../api/communities', () => ({
  getTransfer: () => Promise.resolve({ transfer, handover_available_at: availableAt }),
  listOffers: () => Promise.resolve(offers),
  offerOwnership: (_c: string, candidates: string[]) => {
    calls.push(candidates)
    return Promise.resolve()
  },
  cancelTransfer: () => Promise.resolve(),
  acceptOffer: (id: string) => {
    calls.push(`accept:${id}`)
    return Promise.resolve()
  },
  declineOffer: () => Promise.resolve(),
}))

const members = [
  { user_id: 'u1', display_name: 'Burak', role: 'owner' as const },
  { user_id: 'u2', display_name: 'Ayşe', role: 'moderator' as const },
  { user_id: 'u3', display_name: 'Cem', role: 'member' as const },
]

const page = (myRole: 'owner' | 'member', currentUserId: string, onBecameOwner = () => {}) =>
  render(
    <OwnershipSection
      community={{ id: 'c1', name: 'Ekip' }}
      myRole={myRole}
      currentUserId={currentUserId}
      members={members}
      refreshKey={0}
      onBecameOwner={onBecameOwner}
    />,
  )

describe('OwnershipSection', () => {
  beforeEach(() => {
    transfer = null
    availableAt = null
    offers = []
    calls.length = 0
  })

  it('the owner offers to members in order after typing the name', async () => {
    page('owner', 'u1')
    const form = await screen.findByRole('form', { name: 'Hand over community' })
    const [first, second, third] = screen.getAllByRole('combobox')
    expect(screen.queryAllByRole('option', { name: 'Burak' })).toHaveLength(0)
    fireEvent.change(first, { target: { value: 'u3' } })
    // Someone already chosen is not offered again in the other choices.
    expect(within(second).queryByRole('option', { name: 'Cem' })).toBeNull()
    expect(within(first).getByRole('option', { name: 'Cem' })).toBeInTheDocument()
    fireEvent.change(second, { target: { value: 'u2' } })
    expect(within(third).queryAllByRole('option')).toHaveLength(1)

    fireEvent.submit(form)
    expect(await screen.findByText('Type the community name exactly.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Type the community name to confirm'), {
      target: { value: 'Ekip' },
    })
    fireEvent.submit(form)
    await vi.waitFor(() => expect(calls).toEqual([['u3', 'u2']]))
  })

  it('the asked candidate can accept; members see the deletion notice', async () => {
    offers = [
      { id: 't1', community: { id: 'c1', name: 'Ekip' }, deadline: '2026-11-26T10:00:00Z' },
    ] as OwnershipOffer[]
    const onBecameOwner = vi.fn()
    page('member', 'u3', onBecameOwner)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept ownership' }))
    await vi.waitFor(() => expect(onBecameOwner).toHaveBeenCalled())
    expect(calls).toEqual(['accept:t1'])
  })

  it('a new owner sees when they can hand the community over again', async () => {
    availableAt = '2026-11-30T10:00:00Z'
    page('owner', 'u1')
    expect(await screen.findByText(/You took over this community recently/)).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Hand over community' })).toBeNull()
  })

  it('shows when an ownerless community will be deleted', async () => {
    transfer = {
      status: 'deleting',
      kind: 'account_deleted',
      delete_at: '2026-12-01T10:00:00Z',
    } as Transfer
    page('member', 'u3')
    expect(await screen.findByRole('alert')).toHaveTextContent('It will be deleted on')
  })
})
