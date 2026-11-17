// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'
import { VoiceJoinError } from './api/voice'

describe('App', () => {
  it('shows the product name and the join form', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Nosilence' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join voice room' })).toBeInTheDocument()
  })

  it('shows the server message when joining fails', async () => {
    const join = vi.fn().mockRejectedValue(new VoiceJoinError('Cannot reach the server.'))
    render(<App join={join} />)

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Burak' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join voice room' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.')
    expect(join).toHaveBeenCalledWith('lobby', 'Burak')
  })
})
