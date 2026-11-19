// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, useState } from 'react'
import { confirmEmail } from '../api/accounts'
import { ApiError } from '../api/http'
import { Link } from '../components/Link'

type State = 'working' | 'confirmed' | 'failed'

/** Opened from the confirmation email: /confirm?token=... */
export function ConfirmPage({ token }: { token: string | null }) {
  const [state, setState] = useState<State>(token ? 'working' : 'failed')
  const [message, setMessage] = useState<string>()
  // React's StrictMode runs effects twice in development; a token works only once.
  const sent = useRef(false)

  useEffect(() => {
    if (!token || sent.current) return
    sent.current = true
    confirmEmail(token)
      .then(() => setState('confirmed'))
      .catch((error: unknown) => {
        setState('failed')
        setMessage(error instanceof ApiError ? error.message : undefined)
      })
  }, [token])

  return (
    <section>
      <h2>Confirm your email</h2>
      {state === 'working' && <p role="status">Confirming…</p>}
      {state === 'confirmed' && (
        <p role="status">
          Your email is confirmed. <Link to="/login">Sign in</Link>
        </p>
      )}
      {state === 'failed' && (
        <p role="alert">
          {message ?? 'This link is invalid or has expired.'} Sign up again or ask for a new link by
          signing in.
        </p>
      )}
    </section>
  )
}
