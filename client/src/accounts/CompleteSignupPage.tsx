// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import {
  completeGoogleSignup,
  pendingGoogleSignup,
  type PendingGoogleSignup,
  type User,
} from '../api/accounts'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { collect, displayNameError } from '../validation'
import { useSubmit } from './useSubmit'

/** After a first Google sign-in: choose a display name and confirm being 18+. */
export function CompleteSignupPage({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [pending, setPending] = useState<PendingGoogleSignup | null>()
  const [displayName, setDisplayName] = useState('')
  const [adult, setAdult] = useState(false)
  const { busy, errors, message, run } = useSubmit()

  useEffect(() => {
    pendingGoogleSignup()
      .then((p) => {
        setPending(p)
        setDisplayName((p.name ?? '').slice(0, 32))
      })
      .catch(() => setPending(null))
  }, [])

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      collect({
        display_name: displayNameError(displayName),
        age_confirmed: adult ? undefined : 'You must be 18 or older to use Nosilence.',
      }),
      async () => onSignedIn(await completeGoogleSignup(displayName.trim(), adult)),
    )
  }

  if (pending === undefined) return <p role="status">Loading…</p>
  if (pending === null) {
    return (
      <section>
        <h2>Finish signing up</h2>
        <p role="alert">This sign-up has expired. Please continue with Google again.</p>
        <Link to="/login">Back to sign in</Link>
      </section>
    )
  }

  return (
    <section>
      <h2>Finish signing up</h2>
      <p>Signed in with Google as {pending.email}.</p>
      <form className="stack-form" onSubmit={submit} noValidate>
        <Field
          label="Display name"
          autoComplete="nickname"
          maxLength={64}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          error={errors.display_name}
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
    </section>
  )
}
