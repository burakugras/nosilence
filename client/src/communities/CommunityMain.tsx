// SPDX-License-Identifier: AGPL-3.0-only
import type { ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { useCommunity } from './communityContext'
import { OwnershipSection } from './OwnershipSection'
import { TextChannel } from './TextChannel'

/**
 * The middle of a community (ADR 0016): what members should know about its
 * ownership, then the open text channel.
 */
export function CommunityMain({
  menuButton,
  onToggleMembers,
}: {
  /** Narrow windows: opens the channel column. */
  menuButton: ReactNode
  onToggleMembers: () => void
}) {
  const view = useCommunity()
  const channel = view.channels.find((c) => c.id === view.openTextId)

  return (
    <>
      <OwnershipSection
        part="notices"
        community={view.community}
        myRole={view.myRole}
        currentUserId={view.currentUserId}
        members={view.members}
        refreshKey={view.ownershipKey}
        onBecameOwner={view.reload}
      />
      {channel ? (
        <TextChannel
          key={channel.id}
          channel={channel}
          title={channel.name}
          composerName={`#${channel.name}`}
          icon={<Icon name="hash" />}
          headerStart={menuButton}
          headerEnd={
            <button
              type="button"
              className="icon-button"
              aria-label="Show or hide members"
              title="Members"
              onClick={onToggleMembers}
            >
              <Icon name="people" />
            </button>
          }
          currentUserId={view.currentUserId}
          canDeleteAny={view.canModerate}
          live={view.live}
          onUnreadChange={view.reportUnread}
          people={view.people}
          canMentionEveryone={view.canModerate}
        />
      ) : (
        <>
          <header className="main-header">{menuButton}</header>
          <p className="empty">This community has no text channels yet.</p>
        </>
      )}
    </>
  )
}
