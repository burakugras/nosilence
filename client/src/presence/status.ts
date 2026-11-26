// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What others see of someone (ADR 0017): online, idle (no input for a while),
 * do not disturb, or offline (not connected, or invisible).
 */
export type Status = 'online' | 'idle' | 'dnd' | 'offline'

export const STATUS_LABEL: Record<Status, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do not disturb',
  offline: 'Offline',
}

/** One live connection's presence entry, as the server sends it. */
export type PresenceMeta = {
  display_name?: string
  avatar?: number | null
  status?: 'online' | 'dnd' | 'offline'
  status_text?: string | null
  status_expires_at?: string | null
  idle?: boolean
  voice_channel_id?: string | null
}

/**
 * Someone with several apps open: do not disturb wins, offline only if every
 * connection says so (invisible in voice), idle only if all of them are idle.
 */
export function statusOf(metas: PresenceMeta[]): Status {
  if (metas.some((m) => m.status === 'dnd')) return 'dnd'
  if (metas.length === 0 || metas.every((m) => m.status === 'offline')) return 'offline'
  if (metas.every((m) => m.idle)) return 'idle'
  return 'online'
}

/** The status text while it has not ended, else null. */
export function liveStatusText(
  text: string | null | undefined,
  expiresAt: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!text) return null
  if (expiresAt && new Date(expiresAt).getTime() <= now) return null
  return text
}

/** When a status text should end: never, after 1 or 4 hours, or at the end of today. */
export type Ending = 'never' | '1h' | '4h' | 'today'

/** The end time for `ending`, from `now`, as ISO text (null: never). */
export function endOf(ending: Ending, now = new Date()): string | null {
  if (ending === 'never') return null
  if (ending === 'today') {
    const end = new Date(now)
    end.setHours(23, 59, 59, 0)
    return end.toISOString()
  }
  return new Date(now.getTime() + (ending === '1h' ? 1 : 4) * 3_600_000).toISOString()
}
