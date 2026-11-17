// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { JoinForm } from './JoinForm'
import { validate } from './validation'

describe('validate', () => {
  it('accepts a normal room and name', () => {
    expect(validate('lobby', 'Burak')).toEqual({})
  })

  it.each(['', 'Lobby', '-lobby', 'a b', 'x'.repeat(33)])('rejects room %j', (room) => {
    expect(validate(room, 'Burak').room).toBeDefined()
  })

  it('rejects blank and too long names, counting characters not bytes', () => {
    expect(validate('lobby', '   ').name).toBeDefined()
    expect(validate('lobby', 'ş'.repeat(33)).name).toBeDefined()
    expect(validate('lobby', 'ş'.repeat(32)).name).toBeUndefined()
  })
})

describe('JoinForm', () => {
  it('calls onJoin with the trimmed name', () => {
    const onJoin = vi.fn()
    render(<JoinForm onJoin={onJoin} />)

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  Burak ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Join voice room' }))

    expect(onJoin).toHaveBeenCalledWith('lobby', 'Burak')
  })

  it('shows errors and does not submit invalid input', () => {
    const onJoin = vi.fn()
    render(<JoinForm onJoin={onJoin} />)

    fireEvent.click(screen.getByRole('button', { name: 'Join voice room' }))

    expect(onJoin).not.toHaveBeenCalled()
    expect(screen.getByText('Enter a name.')).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows errors returned by the server', () => {
    render(<JoinForm onJoin={vi.fn()} serverErrors={{ room: 'taken' }} />)
    expect(screen.getByText('taken')).toBeInTheDocument()
  })
})
