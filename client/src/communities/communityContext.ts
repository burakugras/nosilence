// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useContext } from 'react'
import type { Channel, CommunitySummary, Member, Role } from '../api/communities'
import type { CommunityLive } from '../gateway/useCommunityLive'
import type { OnlineMember } from '../gateway/types'
import type { Mentionable } from './mentions'

/**
 * One open community, shared by its three columns (channels, chat, members):
 * one load, one live connection (ADR 0016).
 */
export type CommunityView = {
  community: CommunitySummary
  channels: Channel[]
  myRole: Role
  isOwner: boolean
  canModerate: boolean
  currentUserId: string
  live: CommunityLive
  /** Ids of members shown as online (connected and not invisible). */
  online: Set<string>
  /** Presence of members connected right now, by id (status, picture, voice). */
  presence: Map<string, OnlineMember>
  members: Member[]
  /**
   * The members list and the first presence have both arrived: until then the
   * members column stays empty instead of showing wrong counts.
   */
  membersReady: boolean
  /** Members who can be mentioned with @username (ADR 0017). */
  people: Mentionable[]
  /** Unread messages per text channel. */
  unread: Record<string, number>
  /** Unread messages that mention the user, per text channel (ADR 0018). */
  mentions: Record<string, number>
  /** The text channel on screen. */
  openTextId: string | undefined
  reportUnread: (count: number) => void
  reload: () => void
  /** Changes when the transfer of ownership changed (OwnershipSection reloads). */
  ownershipKey: number
}

export const CommunityContext = createContext<CommunityView | null>(null)

export function useCommunity(): CommunityView {
  const view = useContext(CommunityContext)
  if (!view) throw new Error('useCommunity outside a community')
  return view
}
