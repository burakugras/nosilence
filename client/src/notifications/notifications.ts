// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Notifications for new messages: on the desktop (ADR 0014) and in the browser
 * (ADR 0018). Shown only while the app is in the background, never for the
 * user's own messages, and as the levels set for a community, a channel or a
 * conversation allow; do not disturb silences all of them. By default the
 * notification names the author and channel but not the text: Windows keeps
 * notifications in its history, where anyone at the screen can read them.
 */
import { myStatusChoice } from '../presence/myProfile'
import { useSyncExternalStore } from 'react'
import type { MessageNotice } from '../gateway/types'
import { onUserEvent } from '../gateway/userLive'
import { navigate } from '../router'
import { showNotification } from '../platform'
import { channelLevel, conversationLevel, notifies } from './levels'

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

/** A direct or group message, as the user's topic delivers it. */
type DirectMessage = {
  conversation_id: string
  text: string
  author: { id: string; display_name: string } | null
  mentions?: string[]
}

/** A direct message notice: the author, and the text only if the user asked for it. */
export function directMessageNotification(
  message: DirectMessage,
  settings: NotificationSettings,
  appFocused: boolean,
): { title: string; body: string } | null {
  if (!settings.enabled || appFocused || !message.author) return null
  const title = `${message.author.display_name} sent you a message`
  if (!settings.preview) return { title, body: 'Direct message' }
  const text = message.text.replace(/\s+/g, ' ').trim()
  return { title, body: text.length > MAX_PREVIEW ? `${text.slice(0, MAX_PREVIEW - 1)}…` : text }
}

/**
 * Signed in: notify about others' messages in communities and conversations
 * (the user's topic, opened by the app). Returns a stop function.
 */
export function startMessageNotifications(
  userId: string,
  doNotDisturb: () => boolean = () => myStatusChoice() === 'dnd',
  show: typeof showNotification = showNotification,
): () => void {
  return onUserEvent((event, payload) => {
    // Do not disturb (ADR 0017) silences every notification.
    if (doNotDisturb()) return
    const focused = document.hasFocus() && !document.hidden
    const settings = getNotificationSettings()
    if (event === 'notify') {
      const notice = payload as MessageNotice
      const level = channelLevel(notice.community_id, notice.channel_id)
      if (!notifies(level, !!notice.mentioned)) return
      const shown = noticeToNotification(notice, settings, focused)
      if (shown)
        void show(shown.title, shown.body, () =>
          navigate(`/c/${notice.community_id}/${notice.channel_id}`),
        ).catch(() => undefined)
    }
    if (event === 'dm_created') {
      const message = payload as DirectMessage
      if (message.author?.id === userId) return
      const level = conversationLevel(message.conversation_id)
      if (!notifies(level, (message.mentions ?? []).includes(userId))) return
      const shown = directMessageNotification(message, settings, focused)
      if (shown)
        void show(shown.title, shown.body, () =>
          navigate(`/messages/${message.conversation_id}`),
        ).catch(() => undefined)
    }
  })
}

/** Tests only. */
export function resetNotificationSettingsForTests() {
  current = undefined
}
