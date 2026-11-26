// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/accounts'
import { clearMyProfile, setMyProfile } from '../presence/myProfile'
import { UserPanel } from './UserPanel'

const saved = vi.fn()
vi.mock('../api/profile', () => ({
  saveStatus: (status: { status: string; text: string; expires_at: string | null }) => {
    saved(status)
    return Promise.resolve({
      id: 'u1',
      status: status.status,
      status_text: status.text || null,
      status_expires_at: status.expires_at,
      avatar: null,
    })
  },
}))

const user = { id: 'u1', email: 'a@b.c', display_name: 'Ayşe', username: 'ayse' } as User

describe('the user panel status menu (ADR 0017)', () => {
  afterEach(() => {
    clearMyProfile()
    saved.mockReset()
  })

  it('chooses do not disturb and sets a status text', async () => {
    act(() => setMyProfile(user))
    render(<UserPanel user={user} />)
    fireEvent.click(screen.getByRole('button', { name: 'Set your status (Online)' }))
    const menu = screen.getByRole('dialog', { name: 'Your status' })

    await act(async () => {
      fireEvent.click(within(menu).getByRole('radio', { name: /Do not disturb/ }))
    })
    expect(saved).toHaveBeenLastCalledWith({ status: 'dnd', text: '', expires_at: null })
    expect(within(menu).getByRole('radio', { name: /Do not disturb/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    fireEvent.change(within(menu).getByRole('textbox', { name: 'Status text' }), {
      target: { value: ' In a match ' },
    })
    await act(async () => {
      fireEvent.click(within(menu).getByRole('button', { name: 'Save' }))
    })
    expect(saved).toHaveBeenLastCalledWith({ status: 'dnd', text: 'In a match', expires_at: null })
    // The menu closes; the panel shows the text instead of the username.
    expect(screen.queryByRole('dialog', { name: 'Your status' })).toBeNull()
    expect(screen.getByText('In a match')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Set your status (Do not disturb)' }),
    ).toBeInTheDocument()
  })
})
