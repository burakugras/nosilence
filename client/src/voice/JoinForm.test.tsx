// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JoinForm } from './JoinForm'

describe('JoinForm', () => {
  it('joins the default room', () => {
    const onJoin = vi.fn()
    render(<JoinForm onJoin={onJoin} />)
    fireEvent.click(screen.getByRole('button', { name: 'Join voice room' }))
    expect(onJoin).toHaveBeenCalledWith('lobby')
  })

  it('does not submit an invalid room and marks the field', () => {
    const onJoin = vi.fn()
    render(<JoinForm onJoin={onJoin} />)
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: 'Bad Room' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join voice room' }))

    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Room')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a server error for the room', () => {
    render(<JoinForm onJoin={vi.fn()} serverError="room is full" />)
    expect(screen.getByText('room is full')).toBeInTheDocument()
  })
})
