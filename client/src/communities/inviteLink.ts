// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The invite code in what the user pasted or opened: a whole invite link
 * (`<app>/invite?token=…`), a desktop link (`nosilence://invite/<code>`, ADR
 * 0018) or just the code. Undefined when there is none. The code is only ever
 * sent to our own server.
 */
export function inviteToken(input: string): string | undefined {
  const text = input.trim()
  if (!text) return undefined
  try {
    const url = new URL(text)
    if (url.protocol === 'nosilence:') {
      // nosilence://invite/<code>: "invite" is the host, the code the path.
      if (url.hostname !== 'invite') return undefined
      return validToken(url.pathname.replace(/^\//, ''))
    }
    if (!url.pathname.endsWith('/invite')) return undefined
    return validToken(url.searchParams.get('token'))
  } catch {
    return validToken(text)
  }
}

/** The desktop link for an invite code. */
export const desktopInviteLink = (token: string) => `nosilence://invite/${token}`

// Invite codes are URL-safe base64 (server: Base.url_encode64 of random bytes).
const validToken = (token: string | null) =>
  token && /^[A-Za-z0-9_-]{16,128}$/.test(token) ? token : undefined
