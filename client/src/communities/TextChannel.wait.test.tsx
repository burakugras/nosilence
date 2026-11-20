// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/http'
import { TextChannel } from './TextChannel'

let sendCalls = 0
vi.mock('../api/messages', () => ({
  listMessages: () => Promise.resolve({ messages: [], has_more: false }),
  sendMessage: () => {
    sendCalls += 1
    return Promise.reject(
      new ApiError('You are sending messages too fast. Try again in 30 seconds.', 429, {}, 30),
    )
  },
  deleteMessage: () => Promise.resolve(),
}))

afterEach(() => {
  vi.useRealTimers()
})

describe('TextChannel when sending too fast', () => {
  it('counts down live, keeps the text, and blocks sending until the wait ends', async () => {
    const live = { generation: 1, subscribe: () => () => {} }
    render(
      <TextChannel
        channel={{ id: 't1', name: 'general' }}
        currentUserId="u1"
        canDeleteAny={false}
        live={live}
      />,
    )
    await screen.findByText(/No messages yet/)
    vi.useFakeTimers({ shouldAdvanceTime: false })

    const box = screen.getByRole('textbox', { name: 'Message #general' })
    fireEvent.change(box, { target: { value: 'spam' } })
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter' })
    })

    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are sending messages too fast. You can send again in 30 seconds.',
    )
    expect(box).toHaveValue('spam')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    // It ticks down by itself; trying again neither sends nor resets it.
    act(() => vi.advanceTimersByTime(5_000))
    expect(screen.getByRole('alert')).toHaveTextContent('in 25 seconds')
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(sendCalls).toBe(1)

    act(() => vi.advanceTimersByTime(25_000))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })
})
