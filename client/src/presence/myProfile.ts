// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The signed-in user's own picture and status (ADR 0017), shared by the user
 * panel and the settings window, and kept in step with their other devices
 * through `profile_changed` on the user's topic.
 */
import { useSyncExternalStore } from 'react'
import type { Profile, User } from '../api/accounts'
import { onUserEvent } from '../gateway/userLive'
import { rememberAvatars } from '../ui/avatars'

let me: { id: string; profile: Profile } | undefined
const listeners = new Set<() => void>()

const DEFAULT: Profile = {
  avatar: null,
  status: 'online',
  status_text: null,
  status_expires_at: null,
}

/** Takes the profile fields of a user the server returned. */
export function setMyProfile(user: Pick<User, 'id'> & Partial<Profile>) {
  me = {
    id: user.id,
    profile: {
      avatar: user.avatar ?? null,
      status: user.status ?? 'online',
      status_text: user.status_text ?? null,
      status_expires_at: user.status_expires_at ?? null,
    },
  }
  rememberAvatars([{ id: user.id, avatar: me.profile.avatar }])
  listeners.forEach((l) => l())
}

export function clearMyProfile() {
  me = undefined
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useMyProfile(): Profile {
  return useSyncExternalStore(subscribe, () => me?.profile ?? DEFAULT)
}

export const myStatusChoice = () => me?.profile.status ?? 'online'

// A change made on another device.
onUserEvent((event, payload) => {
  if (event === 'profile_changed' && me) setMyProfile({ id: me.id, ...(payload as Profile) })
})
