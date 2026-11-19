// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { resendConfirmation, signIn, type User } from '../api/accounts'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { collect, emailError } from '../validation'
import { GoogleButton } from './GoogleButton'
import { googleErrorMessage } from './googleErrors'
import { useSubmit } from './useSubmit'

type Props = {
  onSignedIn: (user: User) => void
  /** ?error= code from a failed Google sign-in */
  googleError?: string | null
}

export function LoginPage({ onSignedIn, googleError = null }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, errors, message, status, run } = useSubmit()
  const [resent, setResent] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      collect({
        email: emailError(email),
        password: password ? undefined : 'Enter your password.',
      }),
      async () => onSignedIn(await signIn(email.trim(), password)),
    )
  }

  return (
    <section>
      <h2>Sign in</h2>
      <FormMessage text={googleErrorMessage(googleError)} />
      <GoogleButton />
      <form className="stack-form" onSubmit={submit} noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <FormMessage text={message} />
        {status === 403 && !resent && (
          <button
            type="button"
            className="link-button"
            onClick={() => void resendConfirmation(email.trim()).then(() => setResent(true))}
          >
            Send the confirmation email again
          </button>
        )}
        <FormMessage
          kind="info"
          text={resent ? 'If the account needs it, a new link is on its way.' : undefined}
        />
      </form>
      <p>
        <Link to="/forgot-password">Forgot your password?</Link> ·{' '}
        <Link to="/register">Create an account</Link>
      </p>
    </section>
  )
}
