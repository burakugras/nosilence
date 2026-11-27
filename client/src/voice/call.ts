// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The user's ongoing call. It belongs to the app, not to a page: opening
 * settings, the account or another community keeps the call going until the
 * user leaves it, joins another channel or signs out.
 */
import { useSyncExternalStore } from 'react'
import type { Channel } from '../api/communities'
import type { VoiceJoin } from '../api/voice'

export type Call = {
  communityId: string
  communityName: string
  channel: Channel
  join: VoiceJoin
  /** performance.now() when the user pressed Join, for the join time. */
  startedAt: number
}

let call: Call | null = null
const listeners = new Set<() => void>()

function set(next: Call | null) {
  call = next
  listeners.forEach((l) => l())
}

/** Joining another channel ends the current call first. */
export const startCall = (next: Call) => set(next)
export const endCall = () => set(null)

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useCall = () => useSyncExternalStore(subscribe, () => call)

/** Calls `listener` whenever the call starts, changes or ends (interaction sounds). */
export function onCallChange(listener: (call: Call | null) => void) {
  const l = () => listener(call)
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
