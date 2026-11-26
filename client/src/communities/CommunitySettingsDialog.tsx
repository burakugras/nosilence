// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import {
  deleteChannel,
  deleteCommunity,
  leaveCommunity,
  renameChannel,
  reorderChannels,
  type Channel,
} from '../api/communities'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'
import { navigate } from '../router'
import { closeDialog, openCommunitySettings } from '../settings/settingsDialog'
import { SettingsModal, type ModalSection } from '../ui/Modal'
import { useCommunity } from './communityContext'
import { refreshCommunities } from './communityList'
import { CreateChannelForm } from './CreateChannelForm'
import { InvitesSection } from './InvitesSection'
import { MembersSection } from './MembersSection'
import { OwnershipSection } from './OwnershipSection'

/**
 * Everything about running a community, out of the way of the chat (ADR
 * 0016). Sections depend on the role: channels and ownership for the owner,
 * members and invites for moderators too.
 */
export function CommunitySettingsDialog({ section }: { section: string }) {
  const view = useCommunity()
  const { community, isOwner, canModerate } = view

  const sections: ModalSection[] = [
    { id: 'overview', label: 'Overview' },
    ...(isOwner ? [{ id: 'channels', label: 'Channels' }] : []),
    ...(canModerate ? [{ id: 'members', label: 'Members and roles' }] : []),
    ...(canModerate ? [{ id: 'invites', label: 'Invites' }] : []),
    ...(isOwner ? [{ id: 'ownership', label: 'Ownership' }] : []),
  ]
  const current = sections.some((s) => s.id === section) ? section : 'overview'

  return (
    <SettingsModal
      title={community.name}
      sections={sections}
      current={current}
      onSection={(id) => openCommunitySettings(community.id, id)}
      onClose={closeDialog}
    >
      {current === 'overview' && <Overview />}
      {current === 'channels' && <Channels />}
      {current === 'members' && (
        <>
          <h2>Members and roles</h2>
          <MembersSection
            communityId={community.id}
            currentUserId={view.currentUserId}
            myRole={view.myRole}
            online={view.online}
            refreshKey={view.members.length}
          />
        </>
      )}
      {current === 'invites' && (
        <>
          <h2>Invites</h2>
          <InvitesSection communityId={community.id} />
        </>
      )}
      {current === 'ownership' && (
        <>
          <h2>Ownership</h2>
          <OwnershipSection
            part="handover"
            community={community}
            myRole={view.myRole}
            currentUserId={view.currentUserId}
            members={view.members}
            refreshKey={view.ownershipKey}
            onBecameOwner={view.reload}
          />
        </>
      )}
    </SettingsModal>
  )
}

function Overview() {
  const { community, isOwner, myRole, channels } = useCommunity()
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
      closeDialog()
      await refreshCommunities()
      navigate('/', { replace: true })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.')
    }
  }

  return (
    <>
      <h2>Overview</h2>
      <dl className="overview">
        <dt className="muted">Name</dt>
        <dd>{community.name}</dd>
        <dt className="muted">Your role</dt>
        <dd>{myRole}</dd>
        <dt className="muted">Channels</dt>
        <dd>
          {channels.filter((c) => c.kind === 'text').length} text,{' '}
          {channels.filter((c) => c.kind === 'voice').length} voice
        </dd>
      </dl>
      <div className="danger-zone">
        <h3>{isOwner ? 'Delete community' : 'Leave community'}</h3>
        <p className="muted">
          {isOwner
            ? 'Everyone loses the community and all its messages. To keep it going, hand it over instead (Ownership).'
            : 'You will need a new invite to come back.'}
        </p>
        <button type="button" className="danger" onClick={() => void leaveOrDelete()}>
          {isOwner ? 'Delete this community' : 'Leave this community'}
        </button>
        <FormMessage text={error} />
      </div>
    </>
  )
}

/** The owner's channel list: order, rename, delete, create. */
function Channels() {
  const { community, channels, reload } = useCommunity()
  const [message, setMessage] = useState<string>()

  async function run(action: () => Promise<unknown>, failure: string) {
    setMessage(undefined)
    try {
      await action()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : failure)
    }
  }

  // Move a channel up or down among channels of its kind.
  function move(channel: Channel, step: -1 | 1) {
    const same = channels.filter((c) => c.kind === channel.kind)
    const other = same[same.findIndex((c) => c.id === channel.id) + step]
    if (!other) return
    const ids = channels.map((c) => c.id)
    const a = ids.indexOf(channel.id)
    const b = ids.indexOf(other.id)
    ;[ids[a], ids[b]] = [ids[b], ids[a]]
    void run(() => reorderChannels(community.id, ids), 'Could not move the channel.')
  }

  function rename(channel: Channel) {
    const name = window.prompt('New channel name', channel.name)?.trim()
    if (!name || name === channel.name) return
    void run(() => renameChannel(channel.id, name), 'Could not rename the channel.')
  }

  function remove(channel: Channel) {
    const what = channel.kind === 'text' ? ' and all its messages' : ''
    if (!window.confirm(`Delete the channel "${channel.name}"${what}? This cannot be undone.`))
      return
    void run(() => deleteChannel(channel.id), 'Could not delete the channel.')
  }

  const group = (kind: Channel['kind'], title: string) => {
    const list = channels.filter((c) => c.kind === kind)
    return (
      <>
        <h3>{title}</h3>
        {list.map((c, i) => (
          <div key={c.id} className="channel-row">
            <span>
              {kind === 'text' ? '#' : '🔊'} {c.name}
            </span>
            <span className="actions">
              <button
                type="button"
                className="secondary"
                aria-label={`Move ${c.name} up`}
                disabled={i === 0}
                onClick={() => move(c, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="secondary"
                aria-label={`Move ${c.name} down`}
                disabled={i === list.length - 1}
                onClick={() => move(c, 1)}
              >
                ↓
              </button>
              <button type="button" className="secondary" onClick={() => rename(c)}>
                Rename
              </button>
              <button type="button" className="quiet-danger" onClick={() => remove(c)}>
                Delete
              </button>
            </span>
          </div>
        ))}
      </>
    )
  }

  return (
    <>
      <h2>Channels</h2>
      {group('text', 'Text channels')}
      {group('voice', 'Voice channels')}
      <FormMessage text={message} />
      <h3>New channel</h3>
      <CreateChannelForm communityId={community.id} onCreated={reload} />
    </>
  )
}
