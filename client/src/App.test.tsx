// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { setPendingDesktopSignup } from './accounts/desktopSignup'

vi.mock('./gateway/userLive', () => ({
  startUserLive: () => () => {},
  onUserEvent: () => () => {},
  useUserEvents: () => {},
}))
vi.mock('./api/conversations', () => ({ listConversations: () => Promise.resolve([]) }))
vi.mock('./api/communities', () => ({
  listCommunities: () => Promise.resolve([{ id: 'c1', name: 'Ekip', role: 'owner' }]),
  previewInvite: () => Promise.resolve({ id: 'c1', name: 'Ekip' }),
  listOffers: () => Promise.resolve([]),
}))

const user = { id: 'u1', email: 'burak@example.com', display_name: 'Burak', username: 'burak' }

describe('App', () => {
  afterEach(() => window.history.replaceState(null, '', '/'))

  it('asks for a username once, before anything else', async () => {
    render(<App loadUser={() => Promise.resolve({ ...user, username: null })} />)
    expect(await screen.findByRole('heading', { name: 'Choose a username' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ekip' })).toBeNull()
  })

  it('a desktop Google sign-up shows only its form, not the sign-in page', async () => {
    const signedIn = { id: 'u9', email: 'new@example.com', display_name: 'Neo' }
    setPendingDesktopSignup({
      signup: { email: 'new@example.com', name: 'Neo' },
      complete: () => Promise.resolve(signedIn),
    })
    render(<App loadUser={() => Promise.resolve(null)} />)

    expect(await screen.findByText('Signed in with Google as new@example.com.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByLabelText('Password')).toBeInTheDocument()
  })

  it('shows the sign-in page when nobody is signed in', async () => {
    render(<App loadUser={() => Promise.resolve(null)} />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('signed in: communities on the rail, the user and settings at the bottom left', async () => {
    render(<App loadUser={() => Promise.resolve(user)} />)
    expect(await screen.findByRole('link', { name: 'Ekip' })).toHaveAttribute('href', '/c/c1')
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByText('@burak')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    const settings = screen.getByRole('dialog', { name: 'Settings' })
    fireEvent.click(within(settings).getByRole('button', { name: 'Account' }))
    expect(within(settings).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    fireEvent.click(within(settings).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
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

  it('a pasted invite link opens the invite (the desktop app has no address bar)', async () => {
    render(<App loadUser={() => Promise.resolve(user)} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Create or join a community' }))
    const field = await screen.findByLabelText('Invite link')
    fireEvent.change(field, { target: { value: 'not a link' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open invite' }))
    expect(
      await screen.findByText('Paste the whole invite link you were sent.'),
    ).toBeInTheDocument()

    const code = 'Q2hhbmdlTWVJbnRvQVJlYWxUb2tlbkZvclRlc3RzMTIz'
    fireEvent.change(field, { target: { value: `http://127.0.0.1:5173/invite?token=${code}` } })
    fireEvent.click(screen.getByRole('button', { name: 'Open invite' }))
    expect(await screen.findByRole('heading', { name: 'Join Ekip?' })).toBeInTheDocument()
    expect(window.location.search).toBe(`?token=${code}`)
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
