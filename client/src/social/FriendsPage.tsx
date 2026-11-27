// SPDX-License-Identifier: AGPL-3.0-only
import { useFriendsPresence } from '../presence/friendsPresence'
import { liveStatusText, STATUS_LABEL } from '../presence/status'
import { Avatar } from '../ui/Avatar'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { openDirect } from '../api/conversations'
import { ApiError } from '../api/http'
import {
  acceptFriend,
  blockUser,
  listFriends,
  removeFriend,
  requestFriend,
  unblockUser,
  type FriendsList,
  type Person,
} from '../api/social'
import { Field, FormMessage } from '../components/Field'
import { useUserEvents } from '../gateway/userLive'
import { navigate } from '../router'

const label = (p: Person) => (p.username ? `${p.display_name} (@${p.username})` : p.display_name)

/** Friends, requests both ways, adding by username, blocking (ADR 0015). */
export function FriendsPage() {
  const [list, setList] = useState<FriendsList>()
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState<string>()
  const [error, setError] = useState<string>()

  const load = useCallback(() => {
    listFriends()
      .then(setList)
      .catch(() => setError('Could not load your friends.'))
  }, [])
  useEffect(load, [load])
  useUserEvents((event) => {
    if (event === 'friends_changed' || event === 'joined') load()
  })

  async function act(action: () => Promise<unknown>) {
    setError(undefined)
    setStatus(undefined)
    try {
      await action()
      load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.')
    }
  }

  function add(event: FormEvent) {
    event.preventDefault()
    const name = username.trim().replace(/^@/, '')
    if (!name) return setError('Type a username.')
    void act(async () => {
      const result = await requestFriend({ username: name })
      setUsername('')
      setStatus(result === 'accepted' ? `You and @${name} are now friends.` : 'Request sent.')
    })
  }

  const message = (p: Person) =>
    void act(async () => navigate(`/messages/${await openDirect(p.id)}`))

  return (
    <section>
      <form className="stack-form" onSubmit={add} noValidate aria-label="Add a friend">
        <Field
          label="Add a friend by username"
          placeholder="@username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button type="submit">Send request</button>
      </form>
      {status && <p role="status">{status}</p>}
      <FormMessage text={error} />

      {list === undefined ? (
        <p role="status">Loading…</p>
      ) : (
        <>
          {list.incoming.length > 0 && (
            <People title="Requests to you" people={list.incoming}>
              {(p) => (
                <>
                  <button type="button" onClick={() => void act(() => acceptFriend(p.id))}>
                    Accept
                  </button>{' '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void act(() => removeFriend(p.id))}
                  >
                    Decline
                  </button>
                </>
              )}
            </People>
          )}
          <People title={`Friends (${list.friends.length})`} people={list.friends} withStatus>
            {(p) => (
              <>
                <button type="button" onClick={() => message(p)}>
                  Message
                </button>{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    window.confirm(`Remove ${p.display_name} from your friends?`) &&
                    void act(() => removeFriend(p.id))
                  }
                >
                  Remove
                </button>{' '}
                <BlockButton person={p} act={act} />
              </>
            )}
          </People>
          {list.friends.length === 0 && (
            <p className="muted">No friends yet. Add someone by their username.</p>
          )}
          {list.outgoing.length > 0 && (
            <People title="Your requests" people={list.outgoing}>
              {(p) => (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void act(() => removeFriend(p.id))}
                >
                  Cancel
                </button>
              )}
            </People>
          )}
          {list.blocked.length > 0 && (
            <People title="Blocked" people={list.blocked}>
              {(p) => (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => void act(() => unblockUser(p.id))}
                >
                  Unblock
                </button>
              )}
            </People>
          )}
        </>
      )}
    </section>
  )
}

function People({
  title,
  people,
  withStatus = false,
  children,
}: {
  title: string
  people: Person[]
  /** Friends: their status, live (ADR 0018). */
  withStatus?: boolean
  children: (p: Person) => React.ReactNode
}) {
  const presence = useFriendsPresence()
  return (
    <>
      <h3>{title}</h3>
      <ul className="plain-list" aria-label={title}>
        {people.map((p) => {
          const live = withStatus ? presence.get(p.id) : undefined
          const status = withStatus ? (live?.status ?? 'offline') : undefined
          const text = live ? liveStatusText(live.status_text, live.status_expires_at) : null
          return (
            <li key={p.id}>
              <span className="person">
                <Avatar id={p.id} name={p.display_name} avatar={p.avatar} status={status} />
                <span className="person-name">
                  <span>{label(p)}</span>
                  {status && (
                    <span className="status-text">
                      {STATUS_LABEL[status]}
                      {text && ` · ${text}`}
                    </span>
                  )}
                </span>
              </span>
              <span>{children(p)}</span>
            </li>
          )
        })}
      </ul>
    </>
  )
}

/** Blocking: no messages or requests either way; they are not told. */
export function BlockButton({
  person,
  act,
}: {
  person: Person
  act: (action: () => Promise<unknown>) => Promise<void>
}) {
  return (
    <button
      type="button"
      className="link-button"
      onClick={() =>
        window.confirm(
          `Block ${person.display_name}? You will not get messages or friend requests from them, and they are not told.`,
        ) && void act(() => blockUser(person.id))
      }
    >
      Block
    </button>
  )
}
