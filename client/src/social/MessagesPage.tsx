// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import { createGroup } from '../api/conversations'
import { ApiError } from '../api/http'
import { listFriends, type Person } from '../api/social'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { conversationTitle, useConversations } from './conversationsStore'

const MAX_OTHERS = 9

/** Direct and group conversations, newest first, and starting a group (ADR 0015). */
export function MessagesPage({ currentUserId }: { currentUserId: string }) {
  const conversations = useConversations()

  return (
    <section>
      <h2>Messages</h2>
      <p className="muted">
        Start a direct conversation from <Link to="/friends">Friends</Link> or a community&apos;s
        member list.
      </p>
      {conversations === undefined ? (
        <p role="status">Loading…</p>
      ) : conversations.length === 0 ? (
        <p>No conversations yet.</p>
      ) : (
        <ul className="plain-list" aria-label="Conversations">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`}>{conversationTitle(c, currentUserId)}</Link>
              {c.kind === 'group' && <span className="badge">group</span>}
              {c.unread > 0 && (
                <span className="unread-count" aria-label={`${c.unread} unread`}>
                  {c.unread > 99 ? '99+' : c.unread}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <NewGroup />
    </section>
  )
}

function NewGroup() {
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

  if (!friends || friends.length < 2) return null
  return (
    <form className="stack-form" onSubmit={create} noValidate aria-label="New group">
      <h3>New group</h3>
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
