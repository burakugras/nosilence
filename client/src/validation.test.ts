// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { collect, displayNameError, emailError, passwordError, roomError } from './validation'

describe('validation (mirrors the server)', () => {
  it.each(['', 'Lobby', '-lobby', 'a b', 'x'.repeat(33)])('rejects room %j', (room) => {
    expect(roomError(room)).toBeDefined()
  })

  it('accepts valid rooms', () => {
    expect(roomError('team-42')).toBeUndefined()
  })

  it.each(['', 'no-at', 'a@b', 'a b@c.com'])('rejects email %j', (email) => {
    expect(emailError(email)).toBeDefined()
  })

  it('accepts a normal email with spaces around it', () => {
    expect(emailError('  burak@example.com ')).toBeUndefined()
  })

  it('needs at least 12 characters in a password, counted as characters', () => {
    expect(passwordError('ş'.repeat(11))).toBeDefined()
    expect(passwordError('ş'.repeat(12))).toBeUndefined()
  })

  it('rejects blank, long and invisible-character display names', () => {
    expect(displayNameError('  ')).toBeDefined()
    expect(displayNameError('x'.repeat(33))).toBeDefined()
    expect(displayNameError('Bu‮rak')).toBeDefined()
    expect(displayNameError('Çağrı')).toBeUndefined()
  })

  it('collect keeps only the failing fields', () => {
    expect(collect({ a: undefined, b: 'bad' })).toEqual({ b: 'bad' })
  })
})
