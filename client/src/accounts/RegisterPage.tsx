// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { register, type User } from '../api/accounts'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { collect, displayNameError, emailError, MIN_PASSWORD, passwordError } from '../validation'
import { GoogleButton } from './GoogleButton'
import { useSubmit } from './useSubmit'

export function RegisterPage({ onSignedIn }: { onSignedIn?: (user: User) => void }) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [adult, setAdult] = useState(false)
  const [done, setDone] = useState(false)
  const { busy, errors, message, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      collect({
        email: emailError(email),
        display_name: displayNameError(displayName),
        password: passwordError(password),
        age_confirmed: adult ? undefined : 'You must be 18 or older to use Nosilence.',
      }),
      async () => {
        await register({
          email: email.trim(),
          display_name: displayName.trim(),
          password,
          age_confirmed: adult,
        })
        setDone(true)
      },
    )
  }

  if (done) {
    return (
      <section>
        <h2>Check your email</h2>
        <p>
          We sent a confirmation link to <strong>{email.trim()}</strong>. Open it to finish creating
          your account.
        </p>
        <Link to="/login">Back to sign in</Link>
      </section>
    )
  }

  return (
    <section>
      <h2>Create an account</h2>
      <GoogleButton onSignedIn={onSignedIn} />
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
          label="Display name"
          autoComplete="nickname"
          maxLength={64}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.display_name}
        />
        <Field
          label={`Password (at least ${MIN_PASSWORD} characters)`}
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={adult}
            onChange={(e) => setAdult(e.target.checked)}
            aria-invalid={errors.age_confirmed ? true : undefined}
          />
          I am 18 or older
        </label>
        {errors.age_confirmed && <p className="field-error">{errors.age_confirmed}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
        <FormMessage text={message} />
      </form>
      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </section>
  )
}
