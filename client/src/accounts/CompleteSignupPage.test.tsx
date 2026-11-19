// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompleteSignupPage } from './CompleteSignupPage'

const complete = vi.fn()
let pending: () => Promise<unknown> = () =>
  Promise.resolve({ email: 'g@example.com', name: 'G User' })

// Promises are created outside vi.fn (see RegisterPage.test.tsx).
vi.mock('../api/accounts', () => ({
  pendingGoogleSignup: () => pending(),
  completeGoogleSignup: (...args: unknown[]) => {
    complete(...args)
    return Promise.resolve({ id: 'u1', email: 'g@example.com', display_name: args[0] })
  },
}))

describe('CompleteSignupPage', () => {
  beforeEach(() => {
    complete.mockReset()
    pending = () => Promise.resolve({ email: 'g@example.com', name: 'G User' })
  })

  it('prefills the Google name and needs the 18+ confirmation', async () => {
    const onSignedIn = vi.fn()
    render(<CompleteSignupPage onSignedIn={onSignedIn} />)

    expect(await screen.findByDisplayValue('G User')).toBeInTheDocument()
    expect(screen.getByText(/g@example.com/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(complete).not.toHaveBeenCalled()
    expect(screen.getByText(/must be 18 or older/)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('I am 18 or older'))
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalled())
    expect(complete).toHaveBeenCalledWith('G User', true)
  })

  it('explains when the pending sign-up has expired', async () => {
    pending = () => Promise.reject(new Error('404'))
    render(<CompleteSignupPage onSignedIn={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/expired/)
  })
})
