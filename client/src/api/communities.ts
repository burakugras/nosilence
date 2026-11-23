// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type Role = 'owner' | 'moderator' | 'member'
export type CommunitySummary = { id: string; name: string; role: Role }
export type Channel =
  | { id: string; name: string; kind: 'voice'; capacity: number }
  | { id: string; name: string; kind: 'text'; capacity: null; unread?: number }
export type ChannelKind = Channel['kind']
export type Member = { user_id: string; display_name: string; role: Role }
export type Invite = { id: string; expires_at: string; max_uses: number | null; uses: number }

export const listCommunities = async () =>
  (await request<{ communities: CommunitySummary[] }>('/api/communities')).communities

export const createCommunity = async (name: string) =>
  (
    await request<{ community: { id: string; name: string } }>('/api/communities', {
      method: 'POST',
      body: { name },
    })
  ).community

export const getCommunity = (id: string) =>
  request<{ community: CommunitySummary; channels: Channel[] }>(`/api/communities/${id}`)

export const deleteCommunity = (id: string) =>
  request<void>(`/api/communities/${id}`, { method: 'DELETE' })

export const leaveCommunity = (id: string) =>
  request<void>(`/api/communities/${id}/membership`, { method: 'DELETE' })

export const listMembers = async (id: string) =>
  (await request<{ members: Member[] }>(`/api/communities/${id}/members`)).members

export const removeMember = (id: string, userId: string) =>
  request<void>(`/api/communities/${id}/members/${userId}`, { method: 'DELETE' })

export const createChannel = async (
  id: string,
  channel: { name: string; kind: ChannelKind; capacity?: number },
) =>
  (
    await request<{ channel: Channel }>(`/api/communities/${id}/channels`, {
      method: 'POST',
      body: channel,
    })
  ).channel

export const listInvites = async (id: string) =>
  (await request<{ invites: Invite[] }>(`/api/communities/${id}/invites`)).invites

export const createInvite = (
  id: string,
  options: { expires_in_hours?: number; max_uses?: number | null } = {},
) =>
  request<{ invite: Invite; url: string }>(`/api/communities/${id}/invites`, {
    method: 'POST',
    body: options,
  })

export const revokeInvite = (inviteId: string) =>
  request<void>(`/api/invites/${inviteId}`, { method: 'DELETE' })

// Invite tokens go in the request body, never in a URL path, so they stay out of logs.
export const previewInvite = async (token: string) =>
  (
    await request<{ community: { id: string; name: string } }>('/api/invites/preview', {
      method: 'POST',
      body: { token },
    })
  ).community

export const acceptInvite = async (token: string) =>
  (
    await request<{ community: { id: string; name: string } }>('/api/invites/accept', {
      method: 'POST',
      body: { token },
    })
  ).community

// --- Community management (ADR 0012) ---

export const setRole = (communityId: string, userId: string, role: 'moderator' | 'member') =>
  request<void>(`/api/communities/${communityId}/members/${userId}`, {
    method: 'PATCH',
    body: { role },
  })

/** Disconnects someone from the community's voice channels (owner, moderators). */
export const disconnectVoice = (communityId: string, userId: string) =>
  request<void>(`/api/communities/${communityId}/voice/${userId}`, { method: 'DELETE' })

export const renameChannel = (channelId: string, name: string) =>
  request<void>(`/api/channels/${channelId}`, { method: 'PATCH', body: { name } })

export const deleteChannel = (channelId: string) =>
  request<void>(`/api/channels/${channelId}`, { method: 'DELETE' })

export const reorderChannels = (communityId: string, ids: string[]) =>
  request<void>(`/api/communities/${communityId}/channels/order`, {
    method: 'POST',
    body: { ids },
  })

export type Transfer = {
  id: string
  kind: 'voluntary' | 'account_deleted'
  status: 'offered' | 'deleting' | 'accepted' | 'declined'
  candidates: string[]
  current: number
  deadline: string
  delete_at: string | null
}

/** The open transfer, if any, and when the owner may start one (null: now). */
export type TransferState = { transfer: Transfer | null; handover_available_at: string | null }

export const getTransfer = (communityId: string) =>
  request<TransferState>(`/api/communities/${communityId}/ownership`)

/** Offers the community to up to three members, asked in this order. */
export const offerOwnership = (communityId: string, candidates: string[]) =>
  request<{ transfer: Transfer }>(`/api/communities/${communityId}/ownership`, {
    method: 'POST',
    body: { candidates },
  })

export const cancelTransfer = (communityId: string) =>
  request<void>(`/api/communities/${communityId}/ownership`, { method: 'DELETE' })

export type OwnershipOffer = {
  id: string
  community: { id: string; name: string }
  deadline: string
  kind: Transfer['kind']
}

export const listOffers = async () =>
  (await request<{ offers: OwnershipOffer[] }>('/api/ownership-offers')).offers

export const acceptOffer = (id: string) =>
  request<void>(`/api/ownership-offers/${id}/accept`, { method: 'POST' })

export const declineOffer = (id: string) =>
  request<void>(`/api/ownership-offers/${id}/decline`, { method: 'POST' })
