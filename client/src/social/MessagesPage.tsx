// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import { createGroup } from '../api/conversations'
import { ApiError } from '../api/http'
import { listFriends, type Person } from '../api/social'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'

const MAX_OTHERS = 9

/**
 * Home > "+" next to Direct messages: start a group with friends (ADR 0015).
 * The conversations themselves are listed in the channel column.
 */
export function MessagesPage() {
  const [friends, setFriends] = useState<Person[]>()
  const [chosen, setChosen] = useState<string[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    listFriends()
      .then((l) => setFriends(l.friends))
      .catch(() => setFriends([]))
  }, [])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (chosen.length < 2) return setError('Choose at least two friends.')
    setError(undefined)
    try {
      navigate(`/messages/${await createGroup(chosen, name)}`)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the group.')
    }
  }

  if (friends === undefined) return <p role="status">Loading…</p>
  if (friends.length < 2)
    return (
      <p className="muted">
        A group needs at least two friends. Add friends on the <Link to="/">Friends</Link> page; for
        one person, use Message next to their name.
      </p>
    )

  return (
    <form className="stack-form" onSubmit={create} noValidate aria-label="New group">
      <p className="muted">Up to ten people in all, chosen from your friends.</p>
      {friends.map((f) => (
        <label key={f.id} className="checkbox">
          <input
            type="checkbox"
            checked={chosen.includes(f.id)}
            disabled={!chosen.includes(f.id) && chosen.length >= MAX_OTHERS}
            onChange={(e) =>
              setChosen((c) => (e.target.checked ? [...c, f.id] : c.filter((id) => id !== f.id)))
            }
          />
          {f.display_name}
        </label>
      ))}
      <label className="stack-label">
        Group name (optional)
        <input maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit">Create group</button>
      <FormMessage text={error} />
    </form>
  )
}
