// SPDX-License-Identifier: AGPL-3.0-only
import type { User } from './accounts'
import { request } from './http'

/** Someone on the friends page or in a conversation. */
export type Person = {
  id: string
  display_name: string
  username: string | null
  /** Profile picture version (ADR 0017), or null. */
  avatar?: number | null
}

export type FriendsList = {
  friends: Person[]
  /** Requests others sent the user. */
  incoming: Person[]
  /** Requests the user sent. */
  outgoing: Person[]
  blocked: Person[]
}

export const setUsername = async (username: string) =>
  (await request<{ user: User }>('/api/me/username', { method: 'PUT', body: { username } })).user

export const updatePrivacy = async (
  body: Partial<Pick<User, 'friend_requests_from' | 'community_members_can_message'>>,
) => (await request<{ user: User }>('/api/me/privacy', { method: 'PATCH', body })).user

export const listFriends = () => request<FriendsList>('/api/friends')

/** By username, or by id from a community's member list. */
export const requestFriend = async (target: { username: string } | { user_id: string }) =>
  (
    await request<{ result: 'requested' | 'accepted' }>('/api/friends', {
      method: 'POST',
      body: target,
    })
  ).result

export const acceptFriend = (userId: string) =>
  request<void>(`/api/friends/${userId}/accept`, { method: 'POST' })

/** Declines or cancels a request, or ends a friendship. */
export const removeFriend = (userId: string) =>
  request<void>(`/api/friends/${userId}`, { method: 'DELETE' })

export const blockUser = (userId: string) =>
  request<void>(`/api/blocks/${userId}`, { method: 'POST' })

export const unblockUser = (userId: string) =>
  request<void>(`/api/blocks/${userId}`, { method: 'DELETE' })
