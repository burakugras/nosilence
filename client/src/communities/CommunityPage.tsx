// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteChannel,
  deleteCommunity,
  disconnectVoice,
  getCommunity,
  leaveCommunity,
  renameChannel,
  reorderChannels,
  type Channel,
  type CommunitySummary,
  type Member,
} from '../api/communities'
import { ApiError } from '../api/http'
import { requestChannelJoin } from '../api/voice'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { useCommunityLive } from '../gateway/useCommunityLive'
import { navigate } from '../router'
import { startCall, useCall } from '../voice/call'
import { CreateChannelForm } from './CreateChannelForm'
import { InvitesSection } from './InvitesSection'
import { MembersSection } from './MembersSection'
import { OwnershipSection } from './OwnershipSection'
import { TextChannel } from './TextChannel'

// LiveKit is large; load it only when the user joins a channel.

type Props = {
  communityId: string
  currentUserId: string
  join?: typeof requestChannelJoin
}

type Loaded = { community: CommunitySummary; channels: Channel[] }

export function CommunityPage({ communityId, currentUserId, join = requestChannelJoin }: Props) {
  const [data, setData] = useState<Loaded | null>()
  // The call lives in the app (voice/call.ts), so it survives leaving this page.
  const call = useCall()
  const inCallHere = call?.communityId === communityId ? call : null
  const [joining, setJoining] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [textId, setTextId] = useState<string>()
  const [membersKey, setMembersKey] = useState(0)
  const [members, setMembers] = useState<Member[]>([])
  const [ownershipKey, setOwnershipKey] = useState(0)
  // Unread messages per text channel (ADR 0010): from the server on load, then
  // counted live for the other channels; the open channel reports its own.
  const [unread, setUnread] = useState<Record<string, number>>({})

  const load = useCallback(() => {
    getCommunity(communityId)
      .then((loaded) => {
        setData(loaded)
        setUnread(
          Object.fromEntries(
            loaded.channels.flatMap((c) => (c.kind === 'text' ? [[c.id, c.unread ?? 0]] : [])),
          ),
        )
      })
      .catch(() => setData(null))
  }, [communityId])

  useEffect(load, [load])

  // Removed from the community, or it was deleted: show "not found" at once.
  const onRemoved = useCallback(() => setData(null), [])
  const live = useCommunityLive(communityId, onRemoved)
  const { subscribe } = live

  // The text channel on screen (the chosen one, or the first).
  const openTextId = textId ?? data?.channels.find((c) => c.kind === 'text')?.id

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === 'message_created' &&
          event.message.channel_id !== openTextId &&
          event.message.author?.id !== currentUserId
        )
          setUnread((u) => ({
            ...u,
            [event.message.channel_id]: (u[event.message.channel_id] ?? 0) + 1,
          }))
        if (event.type === 'member_joined' || event.type === 'member_removed')
          setMembersKey((k) => k + 1)
        if (event.type === 'member_updated') {
          setMembersKey((k) => k + 1)
          // Our own role changed: reload what we may do here.
          if (event.user_id === currentUserId) load()
        }
        if (event.type === 'channels_changed') load()
        if (event.type === 'ownership_changed') setOwnershipKey((k) => k + 1)
        if (event.type === 'channel_created')
          setData((d) =>
            d && !d.channels.some((c) => c.id === event.channel.id)
              ? { ...d, channels: [...d.channels, event.channel] }
              : d,
          )
      }),
    [subscribe, openTextId, currentUserId, load],
  )

  const reportUnread = useCallback(
    (count: number) => {
      if (openTextId)
        setUnread((u) => (u[openTextId] === count ? u : { ...u, [openTextId]: count }))
    },
    [openTextId],
  )

  const online = useMemo(() => new Set(live.online.map((m) => m.id)), [live.online])

  async function joinChannel(channel: Channel) {
    setJoining(channel.id)
    setMessage(undefined)
    const startedAt = performance.now()
    try {
      const granted = await join(channel.id)
      startCall({
        communityId,
        communityName: data?.community.name ?? '',
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

  if (data === undefined) return <p role="status">Loading…</p>
  if (data === null) {
    return (
      <section>
        <h2>Community not found</h2>
        <p>It does not exist or you are not a member.</p>
        <Link to="/">Back to your communities</Link>
      </section>
    )
  }

  const { community, channels } = data
  const myRole = community.role
  const isOwner = myRole === 'owner'
  const canModerate = myRole !== 'member'

  // Owner: move a channel up or down among channels of its kind.
  async function move(channel: Channel, step: -1 | 1) {
    const same = channels.filter((c) => c.kind === channel.kind)
    const i = same.findIndex((c) => c.id === channel.id)
    const other = same[i + step]
    if (!other) return
    const ids = channels.map((c) => c.id)
    const a = ids.indexOf(channel.id)
    const b = ids.indexOf(other.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    await reorderChannels(community.id, ids).catch(() => setMessage('Could not move the channel.'))
  }

  async function rename(channel: Channel) {
    const name = window.prompt('New channel name', channel.name)?.trim()
    if (!name || name === channel.name) return
    await renameChannel(channel.id, name).catch((e) =>
      setMessage(e instanceof ApiError ? e.message : 'Could not rename the channel.'),
    )
  }

  async function remove(channel: Channel) {
    const what = channel.kind === 'text' ? ' and all its messages' : ''
    if (!window.confirm(`Delete the channel "${channel.name}"${what}? This cannot be undone.`))
      return
    await deleteChannel(channel.id).catch(() => setMessage('Could not delete the channel.'))
  }

  const channelTools = (channel: Channel) =>
    isOwner && (
      <span className="channel-tools">
        <button
          type="button"
          className="link-button"
          aria-label={`Move ${channel.name} up`}
          onClick={() => void move(channel, -1)}
        >
          ↑
        </button>
        <button
          type="button"
          className="link-button"
          aria-label={`Move ${channel.name} down`}
          onClick={() => void move(channel, 1)}
        >
          ↓
        </button>
        <button type="button" className="link-button" onClick={() => void rename(channel)}>
          Rename
        </button>
        <button type="button" className="link-button" onClick={() => void remove(channel)}>
          Delete
        </button>
      </span>
    )
  const voiceChannels = channels.filter((c) => c.kind === 'voice')
  const textChannels = channels.filter((c) => c.kind === 'text')
  const textChannel = textChannels.find((c) => c.id === textId) ?? textChannels[0]

  return (
    <section>
      <p>
        <Link to="/">← Your communities</Link>
      </p>
      <h2>{community.name}</h2>

      <h3>Voice channels</h3>
      <ul className="plain-list" aria-label="Voice channels">
        {voiceChannels.map((channel) => {
          const inside = live.online.filter((m) => m.voice_channel_id === channel.id)
          const current = inCallHere?.channel.id === channel.id
          return (
            <li key={channel.id}>
              <span>
                {channel.name}{' '}
                <span className="muted">
                  · {inside.length}/{channel.capacity}
                </span>
                {inside.length > 0 && (
                  <span className="voice-members">
                    {' '}
                    {inside.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && ', '}
                        {m.display_name}
                        {canModerate && m.id !== currentUserId && (
                          <button
                            type="button"
                            className="link-button"
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
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </span>
                )}
                {channelTools(channel)}
              </span>
              <button
                type="button"
                disabled={joining !== undefined || current}
                onClick={() => void joinChannel(channel)}
              >
                {joining === channel.id ? 'Joining…' : current ? 'Joined' : 'Join'}
              </button>
            </li>
          )
        })}
      </ul>
      <FormMessage text={message} />

      <h3>Text channels</h3>
      <ul className="plain-list" aria-label="Text channels">
        {textChannels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              className="link-button"
              aria-current={channel.id === textChannel?.id ? 'true' : undefined}
              onClick={() => setTextId(channel.id)}
            >
              #{channel.name}
            </button>
            {channelTools(channel)}
            {(unread[channel.id] ?? 0) > 0 && (
              <span className="unread-count" aria-label={`${unread[channel.id]} unread`}>
                {unread[channel.id] >= 100 ? '99+' : unread[channel.id]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {textChannel && (
        <TextChannel
          key={textChannel.id}
          channel={textChannel}
          currentUserId={currentUserId}
          canDeleteAny={canModerate}
          live={live}
          onUnreadChange={reportUnread}
        />
      )}

      {isOwner && <CreateChannelForm communityId={community.id} onCreated={load} />}

      <MembersSection
        communityId={community.id}
        currentUserId={currentUserId}
        myRole={myRole}
        online={online}
        refreshKey={membersKey}
        onLoaded={setMembers}
      />
      {canModerate && <InvitesSection communityId={community.id} />}
      <OwnershipSection
        community={community}
        myRole={myRole}
        currentUserId={currentUserId}
        members={members}
        refreshKey={ownershipKey}
        onBecameOwner={load}
      />

      <h3>{isOwner ? 'Delete community' : 'Leave community'}</h3>
      <DangerButton
        label={isOwner ? 'Delete this community' : 'Leave this community'}
        confirm={
          isOwner
            ? `Delete "${community.name}" for everyone? This cannot be undone.`
            : `Leave "${community.name}"? You will need a new invite to come back.`
        }
        action={() => (isOwner ? deleteCommunity(community.id) : leaveCommunity(community.id))}
        onDone={() => navigate('/', { replace: true })}
      />
    </section>
  )
}

function DangerButton({
  label,
  confirm,
  action,
  onDone,
}: {
  label: string
  confirm: string
  action: () => Promise<void>
  onDone: () => void
}) {
  const [error, setError] = useState<string>()
  async function click() {
    if (!window.confirm(confirm)) return
    try {
      await action()
      onDone()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    }
  }
  return (
    <>
      <button type="button" className="danger" onClick={() => void click()}>
        {label}
      </button>
      <FormMessage text={error} />
    </>
  )
}
