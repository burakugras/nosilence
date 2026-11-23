// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { inviteToken } from './inviteLink'

const code = 'Q2hhbmdlTWVJbnRvQVJlYWxUb2tlbkZvclRlc3RzMTIz'

describe('inviteToken', () => {
  it('reads the code from a whole link or takes the code itself', () => {
    expect(inviteToken(`http://127.0.0.1:5173/invite?token=${code}`)).toBe(code)
    expect(inviteToken(`  https://nosilence.app/invite?token=${code}\n`)).toBe(code)
    expect(inviteToken(code)).toBe(code)
  })

  it('refuses anything that is not an invite', () => {
    expect(inviteToken('')).toBeUndefined()
    expect(inviteToken('hello')).toBeUndefined()
    expect(inviteToken(`https://example.com/login?token=${code}`)).toBeUndefined()
    expect(inviteToken('http://127.0.0.1:5173/invite')).toBeUndefined()
    expect(inviteToken('http://127.0.0.1:5173/invite?token=<script>')).toBeUndefined()
  })
})
