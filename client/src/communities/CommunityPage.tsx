// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
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
import { navigate } from '../router'
import { CreateChannelForm } from './CreateChannelForm'
import { InvitesSection } from './InvitesSection'
import { MembersSection } from './MembersSection'

// LiveKit is large; load it only when the user joins a channel.
const VoiceRoom = lazy(() => import('../voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

type Props = {
  communityId: string
  join?: typeof requestChannelJoin
}

type Loaded = { community: CommunitySummary; channels: Channel[] }

export function CommunityPage({ communityId, join = requestChannelJoin }: Props) {
  const [data, setData] = useState<Loaded | null>()
  const [voice, setVoice] = useState<{ join: VoiceJoin; channel: Channel }>()
  const [joining, setJoining] = useState<string>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(() => {
    getCommunity(communityId)
      .then(setData)
      .catch(() => setData(null))
  }, [communityId])

  useEffect(load, [load])

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

  if (voice) {
    return (
      <Suspense fallback={<p>Connecting…</p>}>
        <VoiceRoom
          join={voice.join}
          title={`${community.name} · ${voice.channel.name}`}
          onLeave={() => setVoice(undefined)}
        />
      </Suspense>
    )
  }

  return (
    <section>
      <p>
        <Link to="/">← Your communities</Link>
      </p>
      <h2>{community.name}</h2>

      <h3>Voice channels</h3>
      <ul className="plain-list">
        {channels.map((channel) => (
          <li key={channel.id}>
            <span>
              {channel.name} <span className="muted">· up to {channel.capacity}</span>
            </span>
            <button
              type="button"
              disabled={joining !== undefined}
              onClick={() => void joinChannel(channel)}
            >
              {joining === channel.id ? 'Joining…' : 'Join'}
            </button>
          </li>
        ))}
      </ul>
      <FormMessage text={message} />
      {isOwner && <CreateChannelForm communityId={community.id} onCreated={load} />}

      <MembersSection communityId={community.id} isOwner={isOwner} />
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
