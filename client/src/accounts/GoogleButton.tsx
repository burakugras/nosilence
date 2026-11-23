// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { desktopGoogle, GOOGLE_SIGN_IN_URL, providers, type User } from '../api/accounts'
import { ApiError } from '../api/http'
import { cancelDesktopGoogleSignIn, isDesktop } from '../platform'
import { FormMessage } from '../components/Field'
import { setPendingDesktopSignup } from './desktopSignup'

type Props = {
  check?: typeof providers
  /** Desktop app: Google in the system browser (tests replace it). */
  signIn?: typeof desktopGoogle
  /** Desktop app: called after Google sign-in in the system browser succeeded. */
  onSignedIn?: (user: User) => void
}

/** "Continue with Google", shown only when the server has Google configured. */
export function GoogleButton({ check = providers, signIn, onSignedIn }: Props) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    let active = true
    check()
      .then((p) => active && setEnabled(p.google))
      .catch(() => active && setEnabled(false))
    return () => {
      active = false
    }
  }, [check])

  if (!enabled) return null

  if (isDesktop) {
    const start = async () => {
      setBusy(true)
      setMessage(undefined)
      try {
        const outcome = await (signIn ?? desktopGoogle)()
        if ('user' in outcome) onSignedIn?.(outcome.user)
        // A new account: the app shows only the sign-up form (App.tsx).
        else setPendingDesktopSignup(outcome)
      } catch (e) {
        const text = e instanceof ApiError ? e.message : 'Google sign-in failed. Please try again.'
        setMessage(text || undefined)
      } finally {
        setBusy(false)
      }
    }
    return (
      <>
        <p>
          <button type="button" disabled={busy} onClick={() => void start()}>
            {busy ? 'Waiting for the browser…' : 'Continue with Google'}
          </button>
          {busy && (
            <>
              {' '}
              <button
                type="button"
                className="link-button"
                onClick={() => void cancelDesktopGoogleSignIn()}
              >
                Cancel
              </button>
            </>
          )}
        </p>
        <FormMessage text={message} />
      </>
    )
  }

  return (
    <p>
      <a className="button-link" href={GOOGLE_SIGN_IN_URL}>
        Continue with Google
      </a>
    </p>
  )
}
