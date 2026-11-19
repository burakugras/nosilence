// SPDX-License-Identifier: AGPL-3.0-only
import { ApiError, request } from './http'

export type User = { id: string; email: string; display_name: string }

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

export const signIn = async (email: string, password: string) =>
  (await request<{ user: User }>('/api/session', { method: 'POST', body: { email, password } }))
    .user

export const signOut = () => request<void>('/api/session', { method: 'DELETE' })

/** The signed-in user, or null when there is no valid session. */
export async function currentUser(fetchFn?: typeof fetch): Promise<User | null> {
  try {
    return (await request<{ user: User }>('/api/me', { fetchFn })).user
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}
