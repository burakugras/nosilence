// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DesktopGoogleOutcome, User } from '../api/accounts'
import { ApiError } from '../api/http'
import { GoogleButton } from './GoogleButton'

const pending: { current: unknown } = { current: null }
vi.mock('./desktopSignup', () => ({
  setPendingDesktopSignup: (next: unknown) => {
    pending.current = next
  },
}))

const cancel = { run: () => {} }
vi.mock('../platform', () => ({
  cancelDesktopGoogleSignIn: () => {
    cancel.run()
    return Promise.resolve()
  },
  isDesktop: true,
  apiOrigin: '',
  socketUrl: '/socket',
  sessionToken: () => Promise.resolve(null),
  saveSessionToken: () => Promise.resolve(),
  clearSessionToken: () => Promise.resolve(),
  desktopGoogleSignIn: () => Promise.resolve({ error: 'google' }),
}))

const enabled = () => Promise.resolve({ google: true })
const neo: User = { id: 'u9', email: 'new@example.com', display_name: 'Neo' }

describe('GoogleButton in the desktop app', () => {
  it('a first-time Google user goes on to the sign-up form', async () => {
    const outcome: DesktopGoogleOutcome = {
      signup: { email: 'new@example.com', name: 'Neo Anderson' },
      complete: () => Promise.resolve(neo),
    }
    const onSignedIn = vi.fn()
    render(
      <GoogleButton
        check={enabled}
        signIn={() => Promise.resolve(outcome)}
        onSignedIn={onSignedIn}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    await vi.waitFor(() => expect(pending.current).toBe(outcome))
    expect(onSignedIn).not.toHaveBeenCalled()
  })

  it('waiting for the browser can be cancelled', async () => {
    // The app ends the wait as "cancelled", which shows no error.
    const signIn = () =>
      new Promise<DesktopGoogleOutcome>((_, reject) => {
        cancel.run = () => reject(new ApiError('', 0))
      })
    render(<GoogleButton check={enabled} signIn={signIn} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    expect(screen.getByRole('button', { name: 'Waiting for the browser…' })).toBeDisabled()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })))
    expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeEnabled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('an existing user is signed in at once', async () => {
    const onSignedIn = vi.fn()
    render(
      <GoogleButton
        check={enabled}
        signIn={() => Promise.resolve({ user: neo })}
        onSignedIn={onSignedIn}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Google' }))
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(neo))
  })
})
