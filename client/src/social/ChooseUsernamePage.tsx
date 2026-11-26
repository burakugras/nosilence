// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { useSubmit } from '../accounts/useSubmit'
import type { User } from '../api/accounts'
import { setUsername } from '../api/social'
import { Field, FormMessage } from '../components/Field'
import { collect, USERNAME_RULES, usernameError } from '../validation'

/** Everyone picks a unique username once (ADR 0015); friends find each other by it. */
export function ChooseUsernamePage({ user, onDone }: { user: User; onDone: (user: User) => void }) {
  const [name, setName] = useState('')
  const { busy, errors, message, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(collect({ username: usernameError(name) }), async () =>
      onDone(await setUsername(name.trim())),
    )
  }

  return (
    <section>
      <h2>Choose a username</h2>
      <p>
        Hi {user.display_name}! Friends find you by your username, for example <kbd>@ayse</kbd>.
        Your display name stays as it is.
      </p>
      <form className="stack-form" onSubmit={submit} noValidate>
        <Field
          label="Username"
          autoComplete="username"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.username}
        />
        <p className="muted">{USERNAME_RULES}</p>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save username'}
        </button>
        <FormMessage text={message} />
      </form>
    </section>
  )
}
