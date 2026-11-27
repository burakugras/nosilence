// SPDX-License-Identifier: AGPL-3.0-only
import { request } from './http'

/** How something notifies (ADR 0018): every message, mentions only, or nothing. */
export type Level = 'all' | 'mentions' | 'none'
export type LevelTarget = 'community' | 'channel' | 'conversation'

export type LevelSetting = { type: LevelTarget; id: string; level: Level; until: string | null }

export const listNotificationSettings = async () =>
  (await request<{ settings: LevelSetting[] }>('/api/notification-settings')).settings

/** Sets a level; `until` is an ISO time, or null for "until I turn it back on". */
export const putNotificationSetting = (
  type: LevelTarget,
  id: string,
  level: Level,
  until: string | null,
) =>
  request<void>(`/api/notification-settings/${type}/${id}`, {
    method: 'PUT',
    body: { level, until },
  })

/** Back to the default (the community's level for a channel, else every message). */
export const clearNotificationSetting = (type: LevelTarget, id: string) =>
  request<void>(`/api/notification-settings/${type}/${id}`, { method: 'DELETE' })
