// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import {
  capacityError,
  collect,
  displayNameError,
  emailError,
  nameError,
  passwordError,
} from './validation'

describe('validation (mirrors the server)', () => {
  it('limits voice channel capacity to whole numbers from 2 to 8', () => {
    expect(capacityError('8')).toBeUndefined()
    expect(capacityError('2')).toBeUndefined()
    for (const bad of ['1', '9', '4.5', '', 'x']) expect(capacityError(bad)).toBeDefined()
  })

  it('checks names against a given maximum', () => {
    expect(nameError('x'.repeat(50), 50)).toBeUndefined()
    expect(nameError('x'.repeat(51), 50)).toBeDefined()
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
