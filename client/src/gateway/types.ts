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
  | { type: 'account_deleted'; user_id: string; messages_deleted: boolean }
  | { type: 'channel_created'; channel: Channel }
  | { type: 'channels_changed' }
  | { type: 'member_updated'; user_id: string; role: string }
  | { type: 'ownership_changed' }
  | { type: 'message_updated'; message: Message }

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

export type VoiceTopicHandlers = {
  /** Reply to every successful (re)join. */
  joined: (reply: { action: 'create' | 'wait'; group_id: string }) => void
  event: (event: string, payload: Record<string, unknown>) => void
  /** Not allowed (not a member, or not a voice channel). */
  refused: () => void
  /** The server ended the topic. */
  closed: () => void
}

export type VoiceTopic = {
  /** Resolves true when the server accepted the message. */
  push: (event: string, payload: object) => Promise<boolean>
  close: () => void
}

/** Opens a voice channel's MLS topic. Swappable in tests. */
export type OpenVoiceTopic = (
  channelId: string,
  params: () => object,
  handlers: VoiceTopicHandlers,
) => VoiceTopic
