// SPDX-License-Identifier: AGPL-3.0-only
import { channelLevel, communityLevel, useLevels } from '../notifications/levels'
import { NotificationMenu } from '../notifications/NotificationMenu'
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
  const { community, channels, live, currentUserId, canModerate, unread, mentions, openTextId } =
    view
  useLevels()
  const [bell, setBell] = useState<{ channel: Channel; anchor: HTMLElement } | null>(null)
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
            const mentioned = mentions[c.id] ?? 0
            const level = channelLevel(community.id, c.id)
            const muted = level === 'none'
            return (
              <li key={c.id} className="channel-entry">
                <Link
                  to={`/c/${community.id}/${c.id}`}
                  className={['side-item', count > 0 && !muted && 'unread', muted && 'muted']
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={c.id === openTextId ? 'page' : undefined}
                  aria-label={
                    `#${c.name}` +
                    (mentioned > 0 ? `, ${mentioned} mentions` : '') +
                    (count > 0 ? `, ${count} unread` : '') +
                    (muted ? ', muted' : '')
                  }
                >
                  <Icon name="hash" />
                  <span className="name">{c.name}</span>
                  {mentioned > 0 ? (
                    <span className="unread-count mention-count" aria-hidden="true">
                      {mentioned >= 100 ? '99+' : mentioned}
                    </span>
                  ) : (
                    count > 0 &&
                    !muted && (
                      <span className="unread-count" aria-hidden="true">
                        {count >= 100 ? '99+' : count}
                      </span>
                    )
                  )}
                </Link>
                <button
                  type="button"
                  className="icon-button channel-bell"
                  aria-label={`Notifications for #${c.name}`}
                  aria-haspopup="dialog"
                  title="Notifications"
                  onClick={(e) => setBell({ channel: c, anchor: e.currentTarget })}
                >
                  <Icon name={level === 'all' ? 'bell' : 'bellOff'} />
                </button>
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
                        <Avatar id={m.id} name={m.display_name} size="small" avatar={m.avatar} />
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
      {bell && (
        <NotificationMenu
          type="channel"
          id={bell.channel.id}
          name={`#${bell.channel.name}`}
          defaultLabel={LEVEL_LABEL[communityLevel(community.id)]}
          anchor={bell.anchor}
          onClose={() => setBell(null)}
        />
      )}
    </>
  )
}

const LEVEL_LABEL = { all: 'all messages', mentions: 'only mentions', none: 'nothing' } as const

/** The community name's menu: invite, settings, leave or delete. */
function CommunityMenu({ anchor, onClose }: { anchor: HTMLElement; onClose: () => void }) {
  const { community, isOwner, canModerate } = useCommunity()
  const [error, setError] = useState<string>()
  const [notifications, setNotifications] = useState(false)

  if (notifications)
    return (
      <NotificationMenu
        type="community"
        id={community.id}
        name={community.name}
        anchor={anchor}
        onClose={onClose}
      />
    )

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
      <button type="button" onClick={() => setNotifications(true)}>
        <Icon name="bell" /> Notification settings
      </button>
      <hr />
      <button type="button" className="danger-item" onClick={() => void leaveOrDelete()}>
        <Icon name="leave" /> {isOwner ? 'Delete community' : 'Leave community'}
      </button>
      <FormMessage text={error} />
    </Popover>
  )
}
