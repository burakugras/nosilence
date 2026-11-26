// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createInvite, listInvites, revokeInvite, type Invite } from '../api/communities'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'

const LIFETIMES = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '1 day' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
]

const USES = [
  { value: 1, label: '1 use' },
  { value: 5, label: '5 uses' },
  { value: 25, label: '25 uses' },
  { value: null, label: 'No limit' },
]

/** Owner only: time-limited, use-limited invite links. */
export function InvitesSection({ communityId }: { communityId: string }) {
  const [invites, setInvites] = useState<Invite[]>([])
  const [hours, setHours] = useState(168)
  const [maxUses, setMaxUses] = useState<number | null>(5)
  const [link, setLink] = useState<string>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(() => {
    listInvites(communityId)
      .then(setInvites)
      .catch(() => setMessage('Could not load invites.'))
  }, [communityId])

  useEffect(load, [load])

  async function create(event: FormEvent) {
    event.preventDefault()
    setMessage(undefined)
    try {
      const { url } = await createInvite(communityId, {
        expires_in_hours: hours,
        max_uses: maxUses,
      })
      // The link is shown once: only its fingerprint is stored on the server.
      setLink(url)
      load()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not create the invite.')
    }
  }

  async function revoke(id: string) {
    await revokeInvite(id).catch(() => setMessage('Could not revoke the invite.'))
    load()
  }

  return (
    <>
      <h3 className="visually-hidden">Invites</h3>
      <form className="stack-form" onSubmit={create} aria-label="New invite">
        <label htmlFor="invite-lifetime">Expires after</label>
        <select
          id="invite-lifetime"
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {LIFETIMES.map((l) => (
            <option key={l.hours} value={l.hours}>
              {l.label}
            </option>
          ))}
        </select>
        <label htmlFor="invite-uses">Can be used</label>
        <select
          id="invite-uses"
          value={maxUses ?? ''}
          onChange={(e) => setMaxUses(e.target.value === '' ? null : Number(e.target.value))}
        >
          {USES.map((u) => (
            <option key={u.label} value={u.value ?? ''}>
              {u.label}
            </option>
          ))}
        </select>
        <button type="submit">Create invite link</button>
        <FormMessage text={message} />
      </form>

      {link && (
        <p className="invite-link" role="status">
          Share this link (shown only once):{' '}
          <input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.target.select()}
          />
        </p>
      )}

      {invites.length > 0 && (
        <ul className="plain-list" aria-label="Active invites">
          {invites.map((i) => (
            <li key={i.id}>
              <span>
                Expires {new Date(i.expires_at).toLocaleString()} · used {i.uses}
                {i.max_uses ? ` of ${i.max_uses}` : ''}
              </span>
              <button type="button" className="link-button" onClick={() => void revoke(i.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
