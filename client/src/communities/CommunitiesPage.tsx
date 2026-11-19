// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import { useSubmit } from '../accounts/useSubmit'
import { createCommunity, listCommunities, type CommunitySummary } from '../api/communities'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { collect, nameError } from '../validation'

export function CommunitiesPage() {
  const [communities, setCommunities] = useState<CommunitySummary[]>()
  const [loadError, setLoadError] = useState<string>()
  const [name, setName] = useState('')
  const { busy, errors, message, run } = useSubmit()

  useEffect(() => {
    listCommunities()
      .then(setCommunities)
      .catch(() => setLoadError('Could not load your communities.'))
  }, [])

  function create(event: FormEvent) {
    event.preventDefault()
    void run(collect({ name: nameError(name, 50) }), async () => {
      const created = await createCommunity(name.trim())
      navigate(`/c/${created.id}`)
    })
  }

  return (
    <section>
      <h2>Your communities</h2>
      <FormMessage text={loadError} />
      {communities === undefined && !loadError && <p role="status">Loading…</p>}
      {communities?.length === 0 && (
        <p>You are not in any community yet. Create one, or open an invite link.</p>
      )}
      {communities && communities.length > 0 && (
        <ul className="plain-list">
          {communities.map((c) => (
            <li key={c.id}>
              <Link to={`/c/${c.id}`}>{c.name}</Link>
              {c.role === 'owner' && <span className="badge">owner</span>}
            </li>
          ))}
        </ul>
      )}

      <h3>Create a community</h3>
      <form className="stack-form" onSubmit={create} noValidate>
        <Field
          label="Community name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create community'}
        </button>
        <FormMessage text={message} />
      </form>
    </section>
  )
}
