// SPDX-License-Identifier: AGPL-3.0-only
//
// Mirrors the server rules (Nosilence.Accounts.User, Nosilence.Voice) so users get
// instant feedback. The server stays the authority and checks everything again.

export type Errors = Record<string, string>

export const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
export const MIN_PASSWORD = 12
export const MAX_NAME = 32
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// Control characters and invisible formatting characters such as right-to-left overrides.
const INVISIBLE = /[\p{Cc}\p{Cf}]/u

const length = (s: string) => [...s].length

export function roomError(room: string): string | undefined {
  return ROOM_PATTERN.test(room) ? undefined : 'Use 1-32 lowercase letters, digits or dashes.'
}

export function emailError(email: string): string | undefined {
  const value = email.trim()
  if (value === '') return 'Enter your email.'
  if (value.length > 160 || !EMAIL_PATTERN.test(value)) return 'Enter a valid email.'
  return undefined
}

export function passwordError(password: string): string | undefined {
  if (length(password) < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`
  if (length(password) > 256) return 'Password is too long.'
  return undefined
}

export function displayNameError(name: string): string | undefined {
  const value = name.trim()
  if (value === '') return 'Enter a name.'
  if (length(value) > MAX_NAME) return 'Name is too long.'
  if (INVISIBLE.test(value)) return 'Name has invalid characters.'
  return undefined
}

/** Keeps only the fields that have an error. */
export function collect(checks: Record<string, string | undefined>): Errors {
  return Object.fromEntries(
    Object.entries(checks).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}
