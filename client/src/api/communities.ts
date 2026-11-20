// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

export type Role = 'owner' | 'member'
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
