// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Desktop app updates (ADR 0014): checked when the app starts and with "Check for
 * updates". A found update is downloaded in the background; the user decides
 * when to restart into it, so a call is never cut off.
 */
import { useSyncExternalStore } from 'react'
import { downloadUpdate, isDesktop, type DownloadedUpdate } from '../platform'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'latest' }
  | { status: 'ready'; version: string }
  | { status: 'installing'; version: string }
  /** No version has been published to update to (the release address answers 404). */
  | { status: 'unpublished' }
  /** A version was found but its signature is not ours: it is refused. */
  | { status: 'unverified' }
  | { status: 'failed' }

let state: UpdateState = { status: 'idle' }
let ready: DownloadedUpdate | undefined
let dismissed = false
const listeners = new Set<() => void>()

function set(next: UpdateState) {
  state = next
  listeners.forEach((l) => l())
}

/** Checks once; does nothing while a check runs or an update waits. */
export async function checkForUpdates(find: typeof downloadUpdate = downloadUpdate) {
  if (state.status === 'checking' || state.status === 'ready' || state.status === 'installing')
    return
  set({ status: 'checking' })
  try {
    ready = (await find()) ?? undefined
    set(ready ? { status: 'ready', version: ready.version } : { status: 'latest' })
  } catch (error) {
    set({ status: failureOf(error) })
  }
}

/**
 * What a failed check means, from the updater's error: nothing published yet,
 * a package with a wrong signature, or anything else (no connection).
 */
export function failureOf(error: unknown): 'unpublished' | 'unverified' | 'failed' {
  const text = String(error instanceof Error ? error.message : error).toLowerCase()
  if (text.includes('valid release json') || text.includes('404')) return 'unpublished'
  if (text.includes('signature')) return 'unverified'
  return 'failed'
}

export async function installUpdate() {
  if (!ready) return
  set({ status: 'installing', version: ready.version })
  try {
    await ready.install()
  } catch {
    set({ status: 'failed' })
  }
}

/** "Later": hide the banner; the settings page still offers the restart. */
export function dismissUpdateBanner() {
  dismissed = true
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useUpdateState = () => useSyncExternalStore(subscribe, () => state)
export const useBannerDismissed = () => useSyncExternalStore(subscribe, () => dismissed)

const RECHECK_MS = 6 * 60 * 60 * 1000
let startedCheck = false

/**
 * The desktop app looks for an update after starting, signed in or not, and
 * again every six hours while it stays open.
 */
export function checkOnStart() {
  if (!isDesktop || startedCheck) return
  startedCheck = true
  void checkForUpdates()
  window.setInterval(() => void checkForUpdates(), RECHECK_MS)
}

/** Tests only. */
export function resetUpdatesForTests() {
  state = { status: 'idle' }
  ready = undefined
  dismissed = false
  startedCheck = false
}
