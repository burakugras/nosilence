// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The people the user blocked (ADR 0019): left out of the user's @mention
 * suggestions, and their mentions never highlight or count. Known only to the
 * user; whoever blocked the user is never known here.
 */
import { useSyncExternalStore } from 'react'
import { listFriends } from '../api/social'
import { onUserEvent } from '../gateway/userLive'

let blocked = new Set<string>()
const listeners = new Set<() => void>()

function set(next: Set<string>) {
  blocked = next
  listeners.forEach((l) => l())
}

export async function reloadBlocked(load = listFriends) {
  try {
    set(new Set((await load()).blocked.map((p) => p.id)))
  } catch {
    // Offline for a moment: keep what we have.
  }
}

/** While signed in: load now and after friends or blocks change. */
export function followBlocked(): () => void {
  void reloadBlocked()
  const stop = onUserEvent((event) => {
    if (event === 'joined' || event === 'friends_changed') void reloadBlocked()
  })
  return () => {
    stop()
    set(new Set())
  }
}

export const isBlocked = (id: string | undefined) => !!id && blocked.has(id)

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useBlocked = () => useSyncExternalStore(subscribe, () => blocked)

/** Tests only. */
export const setBlockedForTests = (ids: string[]) => set(new Set(ids))
