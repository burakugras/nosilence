// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from 'react'
import { listMembers, removeMember, type Member } from '../api/communities'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'

export function MembersSection({
  communityId,
  isOwner,
  online,
  refreshKey,
}: {
  communityId: string
  isOwner: boolean
  /** Ids of members connected right now. */
  online: Set<string>
  /** Changes when the member list may have changed (someone joined or was removed). */
  refreshKey: number
}) {
  const [members, setMembers] = useState<Member[]>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(() => {
    listMembers(communityId)
      .then(setMembers)
      .catch(() => setMessage('Could not load members.'))
  }, [communityId])

  useEffect(load, [load, refreshKey])

  async function remove(member: Member) {
    if (!window.confirm(`Remove ${member.display_name} from this community?`)) return
    try {
      await removeMember(communityId, member.user_id)
      load()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not remove the member.')
    }
  }

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
              {m.display_name} {m.role === 'owner' && <span className="badge">owner</span>}
            </span>
            {isOwner && m.role !== 'owner' && (
              <button type="button" className="link-button" onClick={() => void remove(m)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
      <FormMessage text={message} />
    </>
  )
}
