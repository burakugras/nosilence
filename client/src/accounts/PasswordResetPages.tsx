// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { requestPasswordReset, resetPassword } from '../api/accounts'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { collect, emailError, MIN_PASSWORD, passwordError } from '../validation'
import { useSubmit } from './useSubmit'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, errors, message, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(collect({ email: emailError(email) }), async () => {
      await requestPasswordReset(email.trim())
      setSent(true)
    })
  }

  return (
    <section>
      <h2>Reset your password</h2>
      {sent ? (
        <p role="status">
          If an account exists for that email, a reset link is on its way. It works for one hour.
        </p>
      ) : (
        <form className="stack-form" onSubmit={submit} noValidate>
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <FormMessage text={message} />
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  )
}

/** Opened from the reset email: /reset-password?token=... */
export function ResetPasswordPage({ token }: { token: string | null }) {
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const { busy, errors, message, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(collect({ password: passwordError(password) }), async () => {
      await resetPassword(token ?? '', password)
      setDone(true)
    })
  }

  return (
    <section>
      <h2>Choose a new password</h2>
      {done ? (
        <p role="status">
          Password changed. You were signed out on all devices. <Link to="/login">Sign in</Link>
        </p>
      ) : (
        <form className="stack-form" onSubmit={submit} noValidate>
          <Field
            label={`New password (at least ${MIN_PASSWORD} characters)`}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <button type="submit" disabled={busy || !token}>
            {busy ? 'Saving…' : 'Set new password'}
          </button>
          <FormMessage text={token ? message : 'This link is missing its token.'} />
        </form>
      )}
    </section>
  )
}
