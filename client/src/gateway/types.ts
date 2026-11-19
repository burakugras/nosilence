// SPDX-License-Identifier: AGPL-3.0-only
import type { Channel } from '../api/communities'
import type { Message } from '../api/messages'

/** Someone connected to the community right now. */
export type OnlineMember = {
  id: string
  display_name: string
  /** The voice channel they are in, if any. */
  voice_channel_id: string | null
}

export type LiveEvent =
  | { type: 'message_created'; message: Message }
  | { type: 'message_deleted'; id: string; channel_id: string }
  | { type: 'member_joined'; user_id: string; display_name: string }
  | { type: 'member_removed'; user_id: string }
  | { type: 'channel_created'; channel: Channel }

export type CommunityListener = {
  presence: (members: OnlineMember[]) => void
  event: (event: LiveEvent) => void
  /** Called on the first join and after every reconnect (missed events may need reloading). */
  joined: () => void
  /** The user was removed or the community was deleted. */
  removed: () => void
}

export type CommunityConnection = {
  setVoiceChannel: (channelId: string | null) => void
  close: () => void
}

/** Opens the live connection for one community. Swappable in tests. */
export type ConnectCommunity = (
  communityId: string,
  listener: CommunityListener,
) => CommunityConnection
