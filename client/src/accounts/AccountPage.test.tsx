// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountPage } from './AccountPage'

const deleted: unknown[] = []
vi.mock('../api/account', () => ({
  deletionPreview: () =>
    Promise.resolve({
      owned_communities: [{ id: 'c1', name: 'Ekip', member_count: 3 }],
      needs_password: true,
    }),
  deleteAccount: (body: unknown) => {
    deleted.push(body)
    return Promise.resolve()
  },
  downloadMyData: () => Promise.resolve(),
}))

const user = { id: 'u1', email: 'burak@example.com', display_name: 'Burak' }

describe('AccountPage', () => {
  beforeEach(() => {
    deleted.length = 0
    vi.spyOn(window, 'confirm').mockReturnValue(true)
  })

  it('warns about owned communities and keeps messages unless asked', async () => {
    const onDeleted = vi.fn()
    render(<AccountPage user={user} onDeleted={onDeleted} />)

    expect(await screen.findByText(/Ekip/)).toBeInTheDocument()
    expect(screen.getByText(/shown as from "Deleted user"/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).not.toBeChecked()

    fireEvent.change(screen.getByLabelText('Type your email to confirm'), {
      target: { value: 'BURAK@example.com' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))

    await vi.waitFor(() => expect(onDeleted).toHaveBeenCalled())
    expect(deleted).toEqual([
      { confirm_email: 'BURAK@example.com', password: 'secret', delete_messages: false },
    ])
  })

  it('asks for the exact email before deleting', async () => {
    render(<AccountPage user={user} onDeleted={() => {}} />)
    await screen.findByText(/Ekip/)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(
      screen.getByText('Your messages will be removed everywhere.', { exact: false }),
    ).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Type your email to confirm'), {
      target: { value: 'someone@else.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }))
    expect(await screen.findByText('Type your email address exactly.')).toBeInTheDocument()
    expect(deleted).toEqual([])
  })
})
