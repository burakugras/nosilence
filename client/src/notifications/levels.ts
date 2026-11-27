// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The user's notification levels (ADR 0018), kept on the server so they follow
 * the user to every device. Loaded when signing in and again whenever another
 * device changes them (`notification_settings_changed`).
 */
import { useSyncExternalStore } from 'react'
import {
  clearNotificationSetting,
  listNotificationSettings,
  putNotificationSetting,
  type Level,
  type LevelSetting,
  type LevelTarget,
} from '../api/notificationSettings'
import { onUserEvent } from '../gateway/userLive'

let settings: LevelSetting[] = []
let version = 0
const listeners = new Set<() => void>()

function set(next: LevelSetting[]) {
  settings = next
  version += 1
  listeners.forEach((l) => l())
}

export async function reloadLevels(load = listNotificationSettings) {
  try {
    set(await load())
  } catch {
    // Offline for a moment: keep what we have.
  }
}

/** The setting of one thing while it applies, else undefined. */
export function ownLevel(type: LevelTarget, id: string, now = Date.now()): Level | undefined {
  const s = settings.find((x) => x.type === type && x.id === id)
  if (!s || (s.until && new Date(s.until).getTime() <= now)) return undefined
  return s.level
}

export function settingOf(type: LevelTarget, id: string): LevelSetting | undefined {
  const s = settings.find((x) => x.type === type && x.id === id)
  return s && ownLevel(type, id) ? s : undefined
}

/** A channel's level: its own, else its community's, else every message. */
export const channelLevel = (communityId: string, channelId: string): Level =>
  ownLevel('channel', channelId) ?? ownLevel('community', communityId) ?? 'all'

export const communityLevel = (communityId: string): Level =>
  ownLevel('community', communityId) ?? 'all'

export const conversationLevel = (conversationId: string): Level =>
  ownLevel('conversation', conversationId) ?? 'all'

/** Whether a message at this level should notify. */
export const notifies = (level: Level, mentioned: boolean) =>
  level === 'all' || (level === 'mentions' && mentioned)

export async function saveLevel(
  type: LevelTarget,
  id: string,
  level: Level | 'default',
  until: string | null,
) {
  if (level === 'default') await clearNotificationSetting(type, id)
  else await putNotificationSetting(type, id, level, until)
  await reloadLevels()
}

/** While signed in: load now and after other devices' changes. Returns a stop function. */
export function followLevels(): () => void {
  void reloadLevels()
  const stop = onUserEvent((event) => {
    if (event === 'joined' || event === 'notification_settings_changed') void reloadLevels()
  })
  return () => {
    stop()
    set([])
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Re-renders when the levels change. */
export const useLevels = () => useSyncExternalStore(subscribe, () => version)

/** Tests only. */
export const setLevelsForTests = (next: LevelSetting[]) => set(next)
