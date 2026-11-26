// SPDX-License-Identifier: AGPL-3.0-only
import { clearSessionToken, desktopGoogleSignIn, isDesktop, saveSessionToken } from '../platform'
import { ApiError, request } from './http'

export type User = {
  id: string
  email: string
  display_name: string
  /** Unique, chosen once after signing up (ADR 0015); null until then. */
  username?: string | null
  /** Who may send friend requests. */
  friend_requests_from?: 'everyone' | 'communities'
  /** Whether people in shared communities may start a conversation. */
  community_members_can_message?: boolean
} & Partial<Profile>

/** Status the user chose (ADR 0017); "idle" is never chosen, the app reports it. */
export type StatusChoice = 'online' | 'dnd' | 'invisible'

/** Profile picture and status, as the server keeps them. */
export type Profile = {
  /** Version of the profile picture, or null for none (the initial is shown). */
  avatar: number | null
  status: StatusChoice
  status_text: string | null
  status_expires_at: string | null
}

export type Registration = {
  email: string
  display_name: string
  password: string
  age_confirmed: boolean
}

export const register = (data: Registration) =>
  request<{ status: string }>('/api/accounts', { method: 'POST', body: data })

export const confirmEmail = (token: string) =>
  request<{ status: string }>('/api/accounts/confirm', { method: 'POST', body: { token } })

export const resendConfirmation = (email: string) =>
  request<{ status: string }>('/api/accounts/confirm/resend', { method: 'POST', body: { email } })

export const requestPasswordReset = (email: string) =>
  request<{ status: string }>('/api/accounts/password-reset', { method: 'POST', body: { email } })

export const resetPassword = (token: string, password: string) =>
  request<{ status: string }>('/api/accounts/password-reset/confirm', {
    method: 'POST',
    body: { token, password },
  })

/** Signs in. The desktop app gets its session token back and stores it. */
export async function signIn(email: string, password: string) {
  const { user, token } = await request<{ user: User; token?: string }>('/api/session', {
    method: 'POST',
    body: { email, password },
  })
  if (token) await saveSessionToken(token)
  return user
}

export async function signOut() {
  try {
    await request<void>('/api/session', { method: 'DELETE' })
  } finally {
    if (isDesktop) await clearSessionToken()
  }
}

const GOOGLE_ERRORS: Record<string, string> = {
  // The user pressed Cancel: nothing to report.
  cancelled: '',
  google_denied: 'Google sign-in was cancelled.',
  google_email: 'Your Google account has no verified email address.',
  timeout: 'Google sign-in took too long. Please try again.',
}

export type DesktopGoogleOutcome =
  | { user: User }
  /** A first-time Google user: the app shows the sign-up form, then calls `complete`. */
  | {
      signup: PendingGoogleSignup
      complete: (displayName: string, adult: boolean) => Promise<User>
    }

/**
 * Desktop app: Google in the system browser, then a one-time code for a session,
 * or for a new account the sign-up form inside the app (ADR 0014).
 */
export async function desktopGoogle(): Promise<DesktopGoogleOutcome> {
  const result = await desktopGoogleSignIn()
  if ('error' in result)
    throw new ApiError(GOOGLE_ERRORS[result.error] ?? 'Google sign-in failed. Please try again.', 0)
  const reply = await request<{ user: User; token: string } | { signup: PendingGoogleSignup }>(
    '/api/auth/desktop/exchange',
    { method: 'POST', body: result },
  )
  if ('signup' in reply) {
    return {
      signup: reply.signup,
      complete: async (display_name, age_confirmed) => {
        const { user, token } = await request<{ user: User; token: string }>(
          '/api/auth/desktop/complete-signup',
          { method: 'POST', body: { ...result, display_name, age_confirmed } },
        )
        await saveSessionToken(token)
        return user
      },
    }
  }
  await saveSessionToken(reply.token)
  return { user: reply.user }
}

/** The signed-in user, or null when there is no valid session. */
export async function currentUser(fetchFn?: typeof fetch): Promise<User | null> {
  try {
    return (await request<{ user: User }>('/api/me', { fetchFn })).user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** Which sign-in providers the server has configured. */
export const providers = () => request<{ google: boolean }>('/api/auth/providers')

/** Full-page navigation: Google sign-in cannot run inside a fetch call. */
export const GOOGLE_SIGN_IN_URL = '/api/auth/google'

export type PendingGoogleSignup = { email: string; name: string | null }

export const pendingGoogleSignup = () => request<PendingGoogleSignup>('/api/auth/google/signup')

export const completeGoogleSignup = async (display_name: string, age_confirmed: boolean) =>
  (
    await request<{ user: User }>('/api/auth/google/signup', {
      method: 'POST',
      body: { display_name, age_confirmed },
    })
  ).user
