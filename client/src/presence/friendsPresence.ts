// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Friends' status (ADR 0018), live from the user's own topic: the server sends
 * it only to friends, and never for someone invisible.
 */
import { useSyncExternalStore } from 'react'
import { onUserEvent } from '../gateway/userLive'
import { rememberAvatars } from '../ui/avatars'
import { statusOf, type PresenceMeta, type Status } from './status'

export type FriendPresence = {
  status: Status
  status_text: string | null
  status_expires_at: string | null
}

let presence = new Map<string, FriendPresence>()
const listeners = new Set<() => void>()

function toPresence(metas: PresenceMeta[]): FriendPresence | undefined {
  if (metas.length === 0) return undefined
  return {
    status: statusOf(metas),
    status_text: metas[0].status_text ?? null,
    status_expires_at: metas[0].status_expires_at ?? null,
  }
}

function changed() {
  listeners.forEach((l) => l())
}

/** Applies the user topic's `friends_presence` (all) and `friend_presence` (one friend). */
export function applyFriendEvent(event: string, payload: unknown) {
  if (event === 'friends_presence') {
    const all = (payload as { presence: Record<string, PresenceMeta[]> }).presence
    presence = new Map(
      Object.entries(all).flatMap(([id, metas]) => {
        const p = toPresence(metas)
        return p ? [[id, p] as const] : []
      }),
    )
    rememberAvatars(Object.entries(all).map(([id, metas]) => ({ id, avatar: metas[0]?.avatar })))
    changed()
  }
  if (event === 'friend_presence') {
    const { user_id, metas } = payload as { user_id: string; metas: PresenceMeta[] }
    const p = toPresence(metas)
    presence = new Map(presence)
    if (p) presence.set(user_id, p)
    else presence.delete(user_id)
    if (metas[0]) rememberAvatars([{ id: user_id, avatar: metas[0].avatar }])
    changed()
  }
}

onUserEvent(applyFriendEvent)

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Every friend who is online now, by id; anyone missing is offline. */
export const useFriendsPresence = () => useSyncExternalStore(subscribe, () => presence)

/** Tests only. */
export function resetFriendsPresenceForTests() {
  presence = new Map()
  changed()
}
