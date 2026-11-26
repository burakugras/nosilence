// SPDX-License-Identifier: AGPL-3.0-only
import type { StatusChoice, User } from './accounts'
import { request } from './http'

/** Stores a new profile picture (a 256×256 WebP made by `ui/avatarImage.ts`). */
export const uploadAvatar = async (webpBase64: string) =>
  (await request<{ user: User }>('/api/me/avatar', { method: 'PUT', body: { image: webpBase64 } }))
    .user

export const removeAvatar = async () =>
  (await request<{ user: User }>('/api/me/avatar', { method: 'DELETE' })).user

/** Status choice, and a short text (empty for none) that may end at `expires_at`. */
export const saveStatus = async (status: {
  status: StatusChoice
  text: string
  expires_at: string | null
}) => (await request<{ user: User }>('/api/me/status', { method: 'PUT', body: status })).user
