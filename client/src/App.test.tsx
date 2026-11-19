// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { ApiError } from './api/http'

const user = { id: 'u1', email: 'burak@example.com', display_name: 'Burak' }

describe('App', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('shows the sign-in page when nobody is signed in', async () => {
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the join form and the user name when signed in', async () => {
    render(<App loadUser={() => Promise.resolve(user)} />)
    expect(await screen.findByRole('button', { name: 'Join voice room' })).toBeInTheDocument()
    expect(screen.getByText(/Burak/, { selector: 'header p' })).toBeInTheDocument()
  })

  it('shows the server message when joining fails', async () => {
    const join = vi.fn().mockRejectedValue(new ApiError('not signed in', 401))
    render(<App loadUser={() => Promise.resolve(user)} join={join} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Join voice room' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('not signed in')
    expect(join).toHaveBeenCalledWith('lobby')
  })

  it('opens the register page from its link', async () => {
    render(<App loadUser={() => Promise.resolve(null)} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Create an account' }))
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
  })

  it('shows the confirmation page for email links even when signed out', async () => {
    window.history.replaceState(null, '', '/confirm')
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })
})
