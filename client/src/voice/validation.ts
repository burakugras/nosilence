// SPDX-License-Identifier: AGPL-3.0-only
import type { FieldErrors } from '../api/voice'

export const ROOM_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/
export const MAX_NAME_LENGTH = 32

/** Mirrors the server rules in Nosilence.Voice so users get instant feedback. */
export function validate(room: string, name: string): FieldErrors {
  const errors: FieldErrors = {}
  if (!ROOM_PATTERN.test(room)) errors.room = 'Use 1-32 lowercase letters, digits or dashes.'
  const trimmed = name.trim()
  if (trimmed === '') errors.name = 'Enter a name.'
  else if ([...trimmed].length > MAX_NAME_LENGTH) errors.name = 'Name is too long.'
  return errors
}
