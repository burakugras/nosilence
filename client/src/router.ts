// SPDX-License-Identifier: AGPL-3.0-only
//
// A tiny router: a handful of pages do not need a routing library.
import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

const snapshot = () => window.location.pathname + window.location.search

// How many of our own pages lie behind this one (kept in the history entry, so
// it is right again after going back or forward).
const depth = (): number => (window.history.state as { depth?: number } | null)?.depth ?? 0

export function navigate(to: string, { replace = false } = {}) {
  if (replace) window.history.replaceState({ depth: depth() }, '', to)
  else window.history.pushState({ depth: depth() + 1 }, '', to)
  listeners.forEach((l) => l())
}

/** Back to the previous page of the app (the desktop app has no back button of its own). */
export const goBack = () => window.history.back()

/** Whether there is a page of the app to go back to. */
export const useCanGoBack = () => useSyncExternalStore(subscribe, () => depth() > 0)

/** Current path and query parameters; re-renders on navigation. */
export function useLocation() {
  const current = useSyncExternalStore(subscribe, snapshot)
  const url = new URL(current, window.location.origin)
  return { path: url.pathname, params: url.searchParams }
}
