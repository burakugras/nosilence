// SPDX-License-Identifier: AGPL-3.0-only
/** Which settings window is open, and at which section (ADR 0016). */
import { useSyncExternalStore } from 'react'

export type UserSettingsSection =
  'voice' | 'notifications' | 'privacy' | 'appearance' | 'account' | 'about'

export type OpenDialog =
  | { kind: 'user'; section: UserSettingsSection }
  | { kind: 'community'; communityId: string; section: string }
  | null

let open: OpenDialog = null
const listeners = new Set<() => void>()

function set(next: OpenDialog) {
  open = next
  listeners.forEach((l) => l())
}

export const openUserSettings = (section: UserSettingsSection = 'voice') =>
  set({ kind: 'user', section })

export const openCommunitySettings = (communityId: string, section = 'overview') =>
  set({ kind: 'community', communityId, section })

export const closeDialog = () => set(null)

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useOpenDialog = () => useSyncExternalStore(subscribe, () => open)
