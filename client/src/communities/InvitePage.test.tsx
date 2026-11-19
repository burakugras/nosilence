// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InvitePage } from './InvitePage'

const accepted = vi.fn()
let preview: () => Promise<unknown> = () => Promise.resolve({ id: 'c1', name: 'Ekip' })

vi.mock('../api/communities', () => ({
  previewInvite: () => preview(),
  acceptInvite: (token: string) => {
    accepted(token)
    return Promise.resolve({ id: 'c1', name: 'Ekip' })
  },
}))

describe('InvitePage', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    preview = () => Promise.resolve({ id: 'c1', name: 'Ekip' })
  })

  it('shows the community and joins it', async () => {
    render(<InvitePage token="tok" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Join Ekip' }))
    await vi.waitFor(() => expect(window.location.pathname).toBe('/c/c1'))
    expect(accepted).toHaveBeenCalledWith('tok')
  })

  it('explains an invalid or expired invite', async () => {
    preview = () => Promise.reject(new Error('422'))
    render(<InvitePage token="bad" />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid, has expired/)
  })

  it('handles a link without a token', async () => {
    render(<InvitePage token={null} />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
