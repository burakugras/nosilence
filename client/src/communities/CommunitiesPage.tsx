// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import { useSubmit } from '../accounts/useSubmit'
import {
  createCommunity,
  listCommunities,
  listOffers,
  type CommunitySummary,
  type OwnershipOffer,
} from '../api/communities'
import { Field, FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { collect, nameError } from '../validation'
import { inviteToken } from './inviteLink'

export function CommunitiesPage() {
  const [communities, setCommunities] = useState<CommunitySummary[]>()
  const [loadError, setLoadError] = useState<string>()
  const [offers, setOffers] = useState<OwnershipOffer[]>([])
  const [name, setName] = useState('')
  const { busy, errors, message, run } = useSubmit()
  const [invite, setInvite] = useState('')
  const [inviteError, setInviteError] = useState<string>()

  useEffect(() => {
    listCommunities()
      .then(setCommunities)
      .catch(() => setLoadError('Could not load your communities.'))
    listOffers()
      .then(setOffers)
      .catch(() => setOffers([]))
  }, [])

  function openInvite(event: FormEvent) {
    event.preventDefault()
    const token = inviteToken(invite)
    if (!token) return setInviteError('Paste the whole invite link you were sent.')
    navigate(`/invite?token=${encodeURIComponent(token)}`)
  }

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
      {offers.map((o) => (
        <p key={o.id} className="banner" role="status">
          You are offered ownership of <Link to={`/c/${o.community.id}`}>{o.community.name}</Link>.
          Open it to answer.
        </p>
      ))}
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

      <h3>Join with an invite</h3>
      <form
        className="stack-form"
        onSubmit={openInvite}
        noValidate
        aria-label="Join with an invite"
      >
        <Field
          label="Invite link"
          value={invite}
          onChange={(e) => {
            setInvite(e.target.value)
            setInviteError(undefined)
          }}
          error={inviteError}
        />
        <button type="submit">Open invite</button>
      </form>

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
