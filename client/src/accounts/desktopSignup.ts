// SPDX-License-Identifier: AGPL-3.0-only
/**
 * A first-time Google user's sign-up in the desktop app (ADR 0014), between
 * "Continue with Google" and the finished account. While it is pending the app
 * shows only the sign-up form, not the sign-in page around the button.
 */
import { useSyncExternalStore } from 'react'
import type { DesktopGoogleOutcome } from '../api/accounts'

export type PendingDesktopSignup = Extract<DesktopGoogleOutcome, { signup: unknown }>

let pending: PendingDesktopSignup | null = null
const listeners = new Set<() => void>()

export function setPendingDesktopSignup(next: PendingDesktopSignup | null) {
  pending = next
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const usePendingDesktopSignup = () => useSyncExternalStore(subscribe, () => pending)
