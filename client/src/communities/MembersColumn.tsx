// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { disconnectVoice, removeMember, setRole, type Member } from '../api/communities'
import { openDirect } from '../api/conversations'
import { ApiError } from '../api/http'
import { blockUser, requestFriend } from '../api/social'
import { FormMessage } from '../components/Field'
import { navigate } from '../router'
import { openUserSettings } from '../settings/settingsDialog'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Popover } from '../ui/Popover'
import { useCommunity } from './communityContext'
import { outranks } from './roles'

/**
 * The right column (ADR 0016): members online and offline, with their roles.
 * Clicking someone opens a card with what can be done with them.
 */
export function MembersColumn() {
  const { members, online } = useCommunity()
  const [card, setCard] = useState<{ member: Member; anchor: HTMLElement } | null>(null)
  const on = members.filter((m) => online.has(m.user_id))
  const off = members.filter((m) => !online.has(m.user_id))

  const row = (m: Member, isOnline: boolean) => (
    <li key={m.user_id}>
      <button
        type="button"
        className={isOnline ? 'member' : 'member offline'}
        aria-haspopup="dialog"
        onClick={(e) => setCard({ member: m, anchor: e.currentTarget })}
      >
        <Avatar id={m.user_id} name={m.display_name} online={isOnline} />
        <span className="name">{m.display_name}</span>
        {m.role !== 'member' && <span className="badge">{m.role}</span>}
      </button>
    </li>
  )

  return (
    <aside className="members" aria-label="Members">
      <p className="section-title">Online — {on.length}</p>
      <ul className="plain-list side-members" aria-label="Members online">
        {on.map((m) => row(m, true))}
      </ul>
      <p className="section-title">Offline — {off.length}</p>
      <ul className="plain-list side-members" aria-label="Members offline">
        {off.map((m) => row(m, false))}
      </ul>
      {card && (
        <MemberCard member={card.member} anchor={card.anchor} onClose={() => setCard(null)} />
      )}
    </aside>
  )
}

function MemberCard({
  member,
  anchor,
  onClose,
}: {
  member: Member
  anchor: HTMLElement
  onClose: () => void
}) {
  const { community, myRole, currentUserId, live, online } = useCommunity()
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()
  const self = member.user_id === currentUserId
  const inVoice = live.online.some((m) => m.id === member.user_id && m.voice_channel_id)

  /** Runs an action; the card closes afterwards unless it shows `keepOpenWith`. */
  async function act(action: () => Promise<unknown>, keepOpenWith?: string) {
    setError(undefined)
    try {
      await action()
      if (keepOpenWith === undefined) onClose()
      else if (keepOpenWith) setDone(keepOpenWith)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    }
  }

  return (
    <Popover anchor={anchor} side="left" label={member.display_name} onClose={onClose}>
      <div className="card-head">
        <Avatar
          id={member.user_id}
          name={member.display_name}
          online={online.has(member.user_id)}
        />
        <div>
          <strong>{member.display_name}</strong>
          {member.username && <div className="muted">@{member.username}</div>}
          {member.role !== 'member' && <span className="badge">{member.role}</span>}
        </div>
      </div>
      <div className="menu">
        {self ? (
          <button
            type="button"
            onClick={() => {
              onClose()
              openUserSettings('privacy')
            }}
          >
            <Icon name="gear" /> Edit username and privacy
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() =>
                void act(async () => navigate(`/messages/${await openDirect(member.user_id)}`))
              }
            >
              <Icon name="chat" /> Message
            </button>
            <button
              type="button"
              onClick={() =>
                void act(async () => {
                  const result = await requestFriend({ user_id: member.user_id })
                  setDone(
                    result === 'accepted'
                      ? `You and ${member.display_name} are now friends.`
                      : 'Friend request sent.',
                  )
                }, '')
              }
            >
              <Icon name="plus" /> Add friend
            </button>
            {myRole === 'owner' && member.role !== 'owner' && <hr />}
            {myRole === 'owner' && member.role === 'member' && (
              <button
                type="button"
                onClick={() => void act(() => setRole(community.id, member.user_id, 'moderator'))}
              >
                Make moderator
              </button>
            )}
            {myRole === 'owner' && member.role === 'moderator' && (
              <button
                type="button"
                onClick={() => void act(() => setRole(community.id, member.user_id, 'member'))}
              >
                Remove moderator
              </button>
            )}
            {outranks(myRole, member.role) && inVoice && (
              <button
                type="button"
                className="danger-item"
                onClick={() => void act(() => disconnectVoice(community.id, member.user_id))}
              >
                Disconnect from voice
              </button>
            )}
            {outranks(myRole, member.role) && (
              <button
                type="button"
                className="danger-item"
                onClick={() =>
                  window.confirm(`Remove ${member.display_name} from this community?`) &&
                  void act(() => removeMember(community.id, member.user_id))
                }
              >
                Remove from community
              </button>
            )}
            <hr />
            <button
              type="button"
              className="danger-item"
              onClick={() =>
                window.confirm(
                  `Block ${member.display_name}? You will not get messages or friend requests from them, and they are not told.`,
                ) && void act(() => blockUser(member.user_id), `${member.display_name} is blocked.`)
              }
            >
              Block
            </button>
          </>
        )}
      </div>
      {done && (
        <p className="form-info" role="status">
          {done}
        </p>
      )}
      <FormMessage text={error} />
    </Popover>
  )
}
