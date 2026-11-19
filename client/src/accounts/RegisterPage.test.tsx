// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import { RegisterPage } from './RegisterPage'

// `register` records calls; `respond` decides the answer. Keeping the rejected promise
// out of vi.fn avoids Vitest 5 reporting a handled rejection as a test failure.
const register = vi.fn()
let respond: () => Promise<unknown> = () => Promise.resolve({})
vi.mock('../api/accounts', () => ({
  register: (...args: unknown[]) => {
    register(...args)
    return respond()
  },
  providers: () => Promise.resolve({ google: false }),
  GOOGLE_SIGN_IN_URL: '/api/auth/google',
}))

function fill({
  email = 'burak@example.com',
  name = 'Burak',
  password = 'correct horse battery',
  adult = true,
} = {}) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } })
  if (adult) fireEvent.click(screen.getByLabelText('I am 18 or older'))
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
}

describe('RegisterPage', () => {
  beforeEach(() => {
    register.mockReset()
    respond = () => Promise.resolve({ status: 'confirmation email sent' })
  })

  it('registers and asks the user to check their email', async () => {
    render(<RegisterPage />)
    fill()

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(register).toHaveBeenCalledWith({
      email: 'burak@example.com',
      display_name: 'Burak',
      password: 'correct horse battery',
      age_confirmed: true,
    })
  })

  it('requires the 18+ confirmation', () => {
    render(<RegisterPage />)
    fill({ adult: false })
    expect(register).not.toHaveBeenCalled()
    expect(screen.getByText(/must be 18 or older/)).toBeInTheDocument()
  })

  it('rejects a short password before calling the server', () => {
    render(<RegisterPage />)
    fill({ password: 'short' })
    expect(register).not.toHaveBeenCalled()
    expect(screen.getByText('Use at least 12 characters.')).toBeInTheDocument()
  })

  it('shows field errors from the server', async () => {
    respond = () =>
      Promise.reject(
        new ApiError('Please check the form.', 422, { email: ['has already been taken'] }),
      )
    render(<RegisterPage />)
    fill()
    expect(await screen.findByText('has already been taken')).toBeInTheDocument()
  })
})
