// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import type { User } from '../api/accounts'
import { ApiError } from '../api/http'
import { setUsername, updatePrivacy } from '../api/social'
import { FormMessage } from '../components/Field'
import { USERNAME_RULES, usernameError } from '../validation'

/** Settings: the username, and who may send requests or start a conversation (ADR 0015). */
export function PrivacySection({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const [name, setName] = useState(user.username ?? '')
  const [message, setMessage] = useState<string>()

  async function save(action: () => Promise<User>) {
    setMessage(undefined)
    try {
      onChange(await action())
    } catch (e) {
      setMessage(e instanceof ApiError ? (e.field('username') ?? e.message) : 'Could not save.')
    }
  }

  function rename(event: FormEvent) {
    event.preventDefault()
    const problem = usernameError(name)
    if (problem) return setMessage(problem)
    void save(() => setUsername(name.trim()))
  }

  return (
    <section aria-label="Privacy" className="stack-form">
      <h3>Username and privacy</h3>
      <form className="inline-form" onSubmit={rename} aria-label="Username">
        <input
          aria-label="Username"
          maxLength={32}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit">Change username</button>
      </form>
      <p className="muted">{USERNAME_RULES}</p>
      <label className="stack-label">
        Who can send you friend requests
        <select
          value={user.friend_requests_from ?? 'everyone'}
          onChange={(e) =>
            void save(() =>
              updatePrivacy({
                friend_requests_from: e.target.value as User['friend_requests_from'],
              }),
            )
          }
        >
          <option value="everyone">Everyone</option>
          <option value="communities">Only people in my communities</option>
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={user.community_members_can_message ?? true}
          onChange={(e) =>
            void save(() => updatePrivacy({ community_members_can_message: e.target.checked }))
          }
        />
        People in my communities can message me (friends always can)
      </label>
      <FormMessage text={message} />
    </section>
  )
}
