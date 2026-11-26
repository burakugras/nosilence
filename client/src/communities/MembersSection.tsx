// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from 'react'
import { listMembers, removeMember, setRole, type Member, type Role } from '../api/communities'
import { openDirect } from '../api/conversations'
import { ApiError } from '../api/http'
import { requestFriend } from '../api/social'
import { navigate } from '../router'
import { FormMessage } from '../components/Field'
import { outranks } from './roles'

export function MembersSection({
  communityId,
  currentUserId,
  myRole,
  online,
  refreshKey,
  onLoaded,
}: {
  communityId: string
  /** Others get "Message" and "Add friend" (ADR 0015). */
  currentUserId?: string
  /** The signed-in user's role here. */
  myRole: Role
  /** Ids of members connected right now. */
  online: Set<string>
  /** Changes when the member list may have changed (joined, removed, new role). */
  refreshKey: number
  /** The members, for other parts of the page (ownership hand-over). */
  onLoaded?: (members: Member[]) => void
}) {
  const [members, setMembers] = useState<Member[]>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(() => {
    listMembers(communityId)
      .then((list) => {
        setMembers(list)
        onLoaded?.(list)
      })
      .catch(() => setMessage('Could not load members.'))
  }, [communityId, onLoaded])

  useEffect(load, [load, refreshKey])

  async function act(action: () => Promise<void>, failure: string) {
    setMessage(undefined)
    try {
      await action()
      load()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : failure)
    }
  }

  const [sent, setSent] = useState<string>()

  async function social(action: () => Promise<unknown>, failure: string) {
    setMessage(undefined)
    try {
      await action()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : failure)
    }
  }

  const openMessages = (m: Member) =>
    void social(
      async () => navigate(`/messages/${await openDirect(m.user_id)}`),
      'Could not open a conversation.',
    )

  const befriend = (m: Member) =>
    void social(async () => {
      const result = await requestFriend({ user_id: m.user_id })
      setSent(
        result === 'accepted'
          ? `You and ${m.display_name} are now friends.`
          : `Friend request sent to ${m.display_name}.`,
      )
    }, 'Could not send a friend request.')

  const remove = (m: Member) =>
    window.confirm(`Remove ${m.display_name} from this community?`) &&
    void act(() => removeMember(communityId, m.user_id), 'Could not remove the member.')

  const changeRole = (m: Member, role: 'moderator' | 'member') =>
    void act(() => setRole(communityId, m.user_id, role), 'Could not change the role.')

  return (
    <>
      <h3>Members{members ? ` (${members.length})` : ''}</h3>
      <ul className="plain-list" aria-label="Members">
        {members?.map((m) => (
          <li key={m.user_id}>
            <span>
              <span
                className={online.has(m.user_id) ? 'dot online' : 'dot'}
                role="img"
                aria-label={online.has(m.user_id) ? 'online' : 'offline'}
              />{' '}
              {m.display_name} {m.role !== 'member' && <span className="badge">{m.role}</span>}
            </span>
            <span>
              {currentUserId && m.user_id !== currentUserId && (
                <>
                  <button type="button" className="link-button" onClick={() => openMessages(m)}>
                    Message
                  </button>{' '}
                  <button type="button" className="link-button" onClick={() => befriend(m)}>
                    Add friend
                  </button>{' '}
                </>
              )}
              {myRole === 'owner' && m.role === 'member' && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => changeRole(m, 'moderator')}
                >
                  Make moderator
                </button>
              )}
              {myRole === 'owner' && m.role === 'moderator' && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => changeRole(m, 'member')}
                >
                  Remove moderator
                </button>
              )}{' '}
              {outranks(myRole, m.role) && (
                <button type="button" className="link-button" onClick={() => remove(m)}>
                  Remove
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {sent && <p role="status">{sent}</p>}
      <FormMessage text={message} />
    </>
  )
}
