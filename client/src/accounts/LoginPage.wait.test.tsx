// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import { LoginPage } from './LoginPage'

vi.mock('../api/accounts', () => ({
  signIn: () =>
    Promise.reject(new ApiError('Too many sign-in attempts. Try again in 1 minute.', 429, {}, 60)),
  resendConfirmation: () => Promise.resolve(),
  providers: () => Promise.resolve({ google: false }),
  GOOGLE_SIGN_IN_URL: '/api/auth/google',
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('LoginPage when rate limited', () => {
  it('shows a live countdown and keeps the button off until it ends', async () => {
    render(<LoginPage onSignedIn={() => {}} />)
    vi.useFakeTimers({ shouldAdvanceTime: false })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'x' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    })

    expect(screen.getByText('Too many sign-in attempts. Try again in 1:00.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(15_000))
    expect(
      screen.getByText('Too many sign-in attempts. Try again in 45 seconds.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign/ })).toBeDisabled()

    act(() => vi.advanceTimersByTime(45_000))
    expect(screen.queryByText(/Too many sign-in attempts/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled()
  })
})
