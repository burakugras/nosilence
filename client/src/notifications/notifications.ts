// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Desktop notifications for new messages (ADR 0014). Shown only while the app
 * is in the background, never for the user's own messages. By default the
 * notification names the author and channel but not the text: Windows keeps
 * notifications in its history, where anyone at the screen can read them.
 */
import { useSyncExternalStore } from 'react'
import { openUserTopic } from '../gateway/phoenixGateway'
import type { MessageNotice } from '../gateway/types'
import { isDesktop, showNotification } from '../platform'

export type NotificationSettings = {
  enabled: boolean
  /** Include the message text. */
  preview: boolean
}

const DEFAULTS: NotificationSettings = { enabled: true, preview: false }
const STORAGE_KEY = 'nosilence.notifications'
const MAX_PREVIEW = 120

let current: NotificationSettings | undefined
const listeners = new Set<() => void>()

function read(): NotificationSettings {
  try {
    const raw = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<NotificationSettings> | null
    return {
      enabled: typeof raw?.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
      preview: raw?.preview === true,
    }
  } catch {
    return DEFAULTS
  }
}

export function getNotificationSettings() {
  current ??= read()
  return current
}

export function updateNotificationSettings(change: Partial<NotificationSettings>) {
  current = { ...getNotificationSettings(), ...change }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Storage refused: the choice still applies until the app restarts.
  }
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useNotificationSettings = () =>
  useSyncExternalStore(subscribe, getNotificationSettings)

/** What the notification says, or null when none should be shown. */
export function noticeToNotification(
  notice: MessageNotice,
  settings: NotificationSettings,
  appFocused: boolean,
): { title: string; body: string } | null {
  if (!settings.enabled || appFocused) return null
  const title = `${notice.author_name} in #${notice.channel_name}`
  if (!settings.preview) return { title, body: notice.community_name }
  const text = notice.text.replace(/\s+/g, ' ').trim()
  return {
    title,
    body: text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text,
  }
}

/** Desktop app, signed in: notify about others' messages. Returns a stop function. */
export function startMessageNotifications(userId: string): () => void {
  if (!isDesktop) return () => {}
  return openUserTopic(userId, (notice) => {
    const shown = noticeToNotification(notice, getNotificationSettings(), document.hasFocus())
    if (shown) void showNotification(shown.title, shown.body).catch(() => undefined)
  })
}

/** Tests only. */
export function resetNotificationSettingsForTests() {
  current = undefined
}
