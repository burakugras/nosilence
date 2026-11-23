// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The invite code in what the user pasted: a whole invite link
 * (`<app>/invite?token=…`) or just the code. Undefined when there is none.
 * The desktop app has no address bar, so invites are pasted on the
 * communities page; the code is only ever sent to our own server.
 */
export function inviteToken(input: string): string | undefined {
  const text = input.trim()
  if (!text) return undefined
  try {
    const url = new URL(text)
    if (!url.pathname.endsWith('/invite')) return undefined
    return validToken(url.searchParams.get('token'))
  } catch {
    return validToken(text)
  }
}

// Invite codes are URL-safe base64 (server: Base.url_encode64 of random bytes).
const validToken = (token: string | null) =>
  token && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : undefined
