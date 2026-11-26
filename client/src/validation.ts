// SPDX-License-Identifier: AGPL-3.0-only
//
// Mirrors the server rules (Nosilence.Accounts.User, Nosilence.Voice) so users get
// instant feedback. The server stays the authority and checks everything again.

export type Errors = Record<string, string>

export const MIN_PASSWORD = 12
export const MAX_NAME = 32
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
// Control characters and invisible formatting characters such as right-to-left overrides.
const INVISIBLE = /[\p{Cc}\p{Cf}]/u

const length = (s: string) => [...s].length

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

/** Trimmed, non-empty, at most `max` characters, no invisible characters. */
export function nameError(name: string, max: number): string | undefined {
  const value = name.trim()
  if (value === '') return 'Enter a name.'
  if (length(value) > max) return 'Name is too long.'
  if (INVISIBLE.test(value)) return 'Name has invalid characters.'
  return undefined
}

export const displayNameError = (name: string) => nameError(name, MAX_NAME)

/** Voice channel capacity: a whole number from 2 to the server's maximum (8 for now). */
export function capacityError(value: string, max = 8): string | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n >= 2 && n <= max ? undefined : `Use a number from 2 to ${max}.`
}

/** Keeps only the fields that have an error. */
export const MAX_MESSAGE = 2000

export function messageError(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return 'Write a message first.'
  if (trimmed.length > MAX_MESSAGE) return `Messages can be at most ${MAX_MESSAGE} characters.`
}

export function collect(checks: Record<string, string | undefined>): Errors {
  return Object.fromEntries(
    Object.entries(checks).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

export const USERNAME_RULES =
  '3-32 characters: letters, digits, _ and . (not at the start or end, not two dots in a row).'

/** The same rules as the server (ADR 0015); case does not matter. */
export function usernameError(value: string): string | undefined {
  const name = value.trim().toLowerCase()
  if (name.length < 3 || name.length > 32) return 'Use 3 to 32 characters.'
  if (!/^[a-z0-9_.]+$/.test(name)) return 'Use only letters, digits, _ and .'
  if (name.startsWith('.') || name.endsWith('.') || name.includes('..'))
    return 'No dot at the start or end, and not two in a row.'
}
