// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

vi.mock('./api/communities', () => ({
  listCommunities: () => Promise.resolve([{ id: 'c1', name: 'Ekip', role: 'owner' }]),
  previewInvite: () => Promise.resolve({ id: 'c1', name: 'Ekip' }),
}))

const user = { id: 'u1', email: 'burak@example.com', display_name: 'Burak' }

describe('App', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('shows the sign-in page when nobody is signed in', async () => {
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows the user’s communities when signed in', async () => {
    render(<App loadUser={() => Promise.resolve(user)} />)
    expect(await screen.findByRole('link', { name: 'Ekip' })).toHaveAttribute('href', '/c/c1')
    // The name in the header leads to the account page.
    expect(screen.getByRole('link', { name: 'Burak' })).toHaveAttribute('href', '/account')
  })

  it('opens the register page from its link', async () => {
    render(<App loadUser={() => Promise.resolve(null)} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Create an account' }))
    expect(await screen.findByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
  })

  it('asks to sign in first when an invite link is opened signed out', async () => {
    window.history.replaceState(null, '', '/invite?token=abc')
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByText('Sign in to accept your invite.')).toBeInTheDocument()
  })

  it('shows the invite when signed in', async () => {
    window.history.replaceState(null, '', '/invite?token=abc')
    render(<App loadUser={() => Promise.resolve(user)} />)
    expect(await screen.findByRole('heading', { name: 'Join Ekip?' })).toBeInTheDocument()
  })

  it('shows the confirmation page for email links even when signed out', async () => {
    window.history.replaceState(null, '', '/confirm')
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByRole('heading', { name: 'Confirm your email' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/)
  })
})
