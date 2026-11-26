// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { deleteCommunity, disconnectVoice, leaveCommunity, type Channel } from '../api/communities'
import { ApiError } from '../api/http'
import { requestChannelJoin } from '../api/voice'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { openCommunitySettings } from '../settings/settingsDialog'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Popover } from '../ui/Popover'
import { startCall, useCall } from '../voice/call'
import { useCallState } from '../voice/callState'
import { useCommunity } from './communityContext'
import { refreshCommunities } from './communityList'

/**
 * A community's channel column (ADR 0016): its name with a menu, text channels
 * with unread counts, voice channels with the people in them. Clicking a voice
 * channel joins it.
 */
export function CommunitySidebar({
  join = requestChannelJoin,
}: {
  join?: typeof requestChannelJoin
}) {
  const view = useCommunity()
  const { community, channels, live, currentUserId, canModerate, unread, openTextId } = view
  const call = useCall()
  const { speaking } = useCallState()
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null)
  const [joining, setJoining] = useState<string>()
  const [message, setMessage] = useState<string>()

  async function joinChannel(channel: Channel) {
    if (call?.channel.id === channel.id) return
    setJoining(channel.id)
    setMessage(undefined)
    const startedAt = performance.now()
    try {
      const granted = await join(channel.id)
      startCall({
        communityId: community.id,
        communityName: community.name,
        channel,
        join: granted,
        startedAt,
      })
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not join the channel.')
    } finally {
      setJoining(undefined)
    }
  }

  const text = channels.filter((c) => c.kind === 'text')
  const voice = channels.filter((c) => c.kind === 'voice')

  return (
    <>
      <button
        type="button"
        className="side-header"
        aria-haspopup="menu"
        aria-expanded={!!menuAnchor}
        onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
      >
        <span>{community.name}</span>
        <Icon name="chevron" />
      </button>
      {menuAnchor && <CommunityMenu anchor={menuAnchor} onClose={() => setMenuAnchor(null)} />}

      <nav className="side-list" aria-label={`${community.name} channels`}>
        <p className="section-title">Text channels</p>
        <ul className="plain-list" aria-label="Text channels">
          {text.map((c) => {
            const count = unread[c.id] ?? 0
            return (
              <li key={c.id}>
                <Link
                  to={`/c/${community.id}/${c.id}`}
                  className={count > 0 ? 'side-item unread' : 'side-item'}
                  aria-current={c.id === openTextId ? 'page' : undefined}
                  aria-label={count > 0 ? `#${c.name}, ${count} unread` : `#${c.name}`}
                >
                  <Icon name="hash" />
                  <span className="name">{c.name}</span>
                  {count > 0 && (
                    <span className="unread-count" aria-hidden="true">
                      {count >= 100 ? '99+' : count}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>

        <p className="section-title">Voice channels</p>
        <ul className="plain-list" aria-label="Voice channels">
          {voice.map((c) => {
            const inside = live.online.filter((m) => m.voice_channel_id === c.id)
            const current = call?.channel.id === c.id
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="side-item"
                  aria-current={current ? 'page' : undefined}
                  aria-label={current ? `${c.name} (joined)` : `Join ${c.name}`}
                  disabled={joining !== undefined}
                  onClick={() => void joinChannel(c)}
                >
                  <Icon name="speaker" />
                  <span className="name">{c.name}</span>
                  <span className="capacity">
                    {joining === c.id ? 'Joining…' : `${inside.length}/${c.capacity}`}
                  </span>
                </button>
                {inside.length > 0 && (
                  <ul className="voice-people" aria-label={`In ${c.name}`}>
                    {inside.map((m) => (
                      <li key={m.id} className={speaking.includes(m.id) ? 'speaking' : undefined}>
                        <Avatar id={m.id} name={m.display_name} size="small" />
                        {m.display_name}
                        {speaking.includes(m.id) && (
                          <span className="visually-hidden"> is speaking</span>
                        )}
                        {canModerate && m.id !== currentUserId && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Disconnect ${m.display_name}`}
                            title="Disconnect from voice"
                            onClick={() =>
                              void disconnectVoice(community.id, m.id).catch((e) =>
                                setMessage(
                                  e instanceof ApiError ? e.message : 'Could not disconnect.',
                                ),
                              )
                            }
                          >
                            <Icon name="close" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
        <FormMessage text={message} />
      </nav>
    </>
  )
}

/** The community name's menu: invite, settings, leave or delete. */
function CommunityMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { community, isOwner, canModerate } = useCommunity()
  const [error, setError] = useState<string>()

  async function leaveOrDelete() {
    const sure = window.confirm(
      isOwner
        ? `Delete "${community.name}" for everyone? This cannot be undone.`
        : `Leave "${community.name}"? You will need a new invite to come back.`,
    )
    if (!sure) return
    try {
      await (isOwner ? deleteCommunity(community.id) : leaveCommunity(community.id))
      onClose()
      await refreshCommunities()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    }
  }

  const open = (section: string) => {
    onClose()
    openCommunitySettings(community.id, section)
  }

  return (
    <Popover anchor={anchor} label={`${community.name} menu`} onClose={onClose} className="menu">
      {canModerate && (
        <button type="button" onClick={() => open('invites')}>
          <Icon name="invite" /> Invite people
        </button>
      )}
      {canModerate && (
        <button type="button" onClick={() => open(isOwner ? 'overview' : 'members')}>
          <Icon name="gear" /> Community settings
        </button>
      )}
      {canModerate && <hr />}
      <button type="button" className="danger-item" onClick={() => void leaveOrDelete()}>
        <Icon name="leave" /> {isOwner ? 'Delete community' : 'Leave community'}
      </button>
      <FormMessage text={error} />
    </Popover>
  )
}
