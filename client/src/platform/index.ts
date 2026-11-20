// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The one place that knows whether we run in a browser or in the desktop app
 * (Tauri). Everything desktop-only goes through here, so the rest of the client
 * stays the same on both, and another shell (macOS later) only needs this file.
 */

/** Tauri injects this into its WebView. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Where the API lives. On the web it is the same origin as the page (''); the
 * desktop build has the server URL built in (`VITE_API_ORIGIN`).
 */
export const apiOrigin: string = import.meta.env.VITE_API_ORIGIN ?? ''

/** URL of the real-time gateway. */
export const socketUrl = apiOrigin ? apiOrigin.replace(/^http/, 'ws') + '/socket' : '/socket'

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(command, args)
}

let token: Promise<string | null> | undefined

/**
 * The desktop app's session token, kept in the operating system's credential
 * store (Windows Credential Manager). On the web the session is an HttpOnly
 * cookie that JavaScript never sees, so this is null.
 */
export function sessionToken(): Promise<string | null> {
  if (!isDesktop) return Promise.resolve(null)
  token ??= invoke<string | null>('load_token').catch(() => null)
  return token
}

export async function saveSessionToken(value: string) {
  token = Promise.resolve(value)
  await invoke('store_token', { token: value })
}

export async function clearSessionToken() {
  token = Promise.resolve(null)
  await invoke('clear_token').catch(() => undefined)
}

export type DesktopGoogleResult = { code: string; verifier: string } | { error: string }

/**
 * Google sign-in for the desktop app: opens the system browser and waits for
 * the server to send it back to a loopback address (RFC 8252, with PKCE).
 */
export const desktopGoogleSignIn = () =>
  invoke<DesktopGoogleResult>('google_sign_in', { apiOrigin })
