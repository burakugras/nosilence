// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import {
  deleteCommunity,
  getCommunity,
  leaveCommunity,
  type Channel,
  type CommunitySummary,
} from '../api/communities'
import { ApiError } from '../api/http'
import { requestChannelJoin, type VoiceJoin } from '../api/voice'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { useCommunityLive } from '../gateway/useCommunityLive'
import { navigate } from '../router'
import { CreateChannelForm } from './CreateChannelForm'
import { InvitesSection } from './InvitesSection'
import { MembersSection } from './MembersSection'
import { TextChannel } from './TextChannel'

// LiveKit is large; load it only when the user joins a channel.
const VoiceRoom = lazy(() => import('../voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

type Props = {
  communityId: string
  currentUserId: string
  join?: typeof requestChannelJoin
}

type Loaded = { community: CommunitySummary; channels: Channel[] }

export function CommunityPage({ communityId, currentUserId, join = requestChannelJoin }: Props) {
  const [data, setData] = useState<Loaded | null>()
  const [voice, setVoice] = useState<{ join: VoiceJoin; channel: Channel }>()
  const [joining, setJoining] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [textId, setTextId] = useState<string>()
  const [membersKey, setMembersKey] = useState(0)

  const load = useCallback(() => {
    getCommunity(communityId)
      .then(setData)
      .catch(() => setData(null))
  }, [communityId])

  useEffect(load, [load])

  // Removed from the community, or it was deleted: show "not found" at once.
  const onRemoved = useCallback(() => {
    setVoice(undefined)
    setData(null)
  }, [])
  const live = useCommunityLive(communityId, onRemoved)
  const { setVoiceChannel, subscribe } = live

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'member_joined' || event.type === 'member_removed')
          setMembersKey((k) => k + 1)
        if (event.type === 'channel_created')
          setData((d) =>
            d && !d.channels.some((c) => c.id === event.channel.id)
              ? { ...d, channels: [...d.channels, event.channel] }
              : d,
          )
      }),
    [subscribe],
  )

  const online = useMemo(() => new Set(live.online.map((m) => m.id)), [live.online])

  async function joinChannel(channel: Channel) {
    setJoining(channel.id)
    setMessage(undefined)
    try {
      setVoice({ join: await join(channel.id), channel })
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not join the channel.')
    } finally {
      setJoining(undefined)
    }
  }

  const leaveVoice = useCallback(() => {
    setVoice(undefined)
    setVoiceChannel(null)
  }, [setVoiceChannel])

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
  const isOwner = community.role === 'owner'
  const voiceChannels = channels.filter((c) => c.kind === 'voice')
  const textChannels = channels.filter((c) => c.kind === 'text')
  const textChannel = textChannels.find((c) => c.id === textId) ?? textChannels[0]

  return (
    <section>
      <p>
        <Link to="/">← Your communities</Link>
      </p>
      <h2>{community.name}</h2>

      {voice && (
        <Suspense fallback={<p>Connecting…</p>}>
          <VoiceRoom
            key={voice.channel.id}
            join={voice.join}
            channelId={voice.channel.id}
            title={`${community.name} · ${voice.channel.name}`}
            onConnected={() => setVoiceChannel(voice.channel.id)}
            onLeave={leaveVoice}
          />
        </Suspense>
      )}

      <h3>Voice channels</h3>
      <ul className="plain-list" aria-label="Voice channels">
        {voiceChannels.map((channel) => {
          const inside = live.online.filter((m) => m.voice_channel_id === channel.id)
          const current = voice?.channel.id === channel.id
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
                    {inside.map((m) => m.display_name).join(', ')}
                  </span>
                )}
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
          </li>
        ))}
      </ul>
      {textChannel && (
        <TextChannel
          key={textChannel.id}
          channel={textChannel}
          currentUserId={currentUserId}
          canDeleteAny={isOwner}
          live={live}
        />
      )}

      {isOwner && <CreateChannelForm communityId={community.id} onCreated={load} />}

      <MembersSection
        communityId={community.id}
        isOwner={isOwner}
        online={online}
        refreshKey={membersKey}
      />
      {isOwner && <InvitesSection communityId={community.id} />}

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
