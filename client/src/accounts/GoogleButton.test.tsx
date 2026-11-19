// SPDX-License-Identifier: AGPL-3.0-only
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GoogleButton } from './GoogleButton'
import { googleErrorMessage } from './googleErrors'

describe('GoogleButton', () => {
  it('links to the server-side Google sign-in when enabled', async () => {
    render(<GoogleButton check={() => Promise.resolve({ google: true })} />)
    const link = await screen.findByRole('link', { name: 'Continue with Google' })
    expect(link).toHaveAttribute('href', '/api/auth/google')
  })

  it('stays hidden when Google is not configured', async () => {
    const check = () => Promise.resolve({ google: false })
    render(<GoogleButton check={check} />)
    await check()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('maps server error codes to messages and ignores unknown ones', () => {
    expect(googleErrorMessage('google_denied')).toMatch(/cancelled/)
    expect(googleErrorMessage('google_email')).toMatch(/not verified/)
    expect(googleErrorMessage('something-else')).toBeUndefined()
    expect(googleErrorMessage(null)).toBeUndefined()
  })
})
