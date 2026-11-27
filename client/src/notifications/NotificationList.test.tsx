// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecentNotification } from '../api/notificationSettings'
import * as router from '../router'
import { NotificationList } from './NotificationList'

const item = (over: Partial<RecentNotification>): RecentNotification => ({
  message_id: 'm1',
  channel_id: 't1',
  channel_name: 'general',
  author: { id: 'a', display_name: 'Ayşe', avatar: null },
  text: 'Akşam  oyuna\ngeliyor musun?',
  inserted_at: new Date().toISOString(),
  unread: true,
  mentioned: false,
  ...over,
})

describe("the bell's list (ADR 0019)", () => {
  it('one line per notification, unread in bold; a click opens the channel', async () => {
    const go = vi.spyOn(router, 'navigate').mockImplementation(() => {})
    const onClose = vi.fn()
    const anchor = document.createElement('button')
    document.body.append(anchor)
    render(
      <NotificationList
        communityId="c1"
        communityName="Ekip"
        anchor={anchor}
        onClose={onClose}
        load={() =>
          Promise.resolve([
            item({ mentioned: true }),
            item({ message_id: 'm2', channel_id: 't2', channel_name: 'news', unread: false }),
          ])
        }
      />,
    )
    const list = await screen.findByRole('list')
    const rows = within(list).getAllByRole('button')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveClass('unread')
    expect(rows[0]).toHaveTextContent('Ayşe · #general: Akşam oyuna geliyor musun?')
    expect(within(rows[0]).getByLabelText('mentions you')).toBeInTheDocument()
    expect(rows[1]).not.toHaveClass('unread')

    fireEvent.click(rows[1])
    expect(onClose).toHaveBeenCalled()
    expect(go).toHaveBeenCalledWith('/c/c1/t2')
    go.mockRestore()
  })

  it('says when there is nothing yet', async () => {
    render(
      <NotificationList
        communityId="c1"
        communityName="Ekip"
        anchor={document.createElement('button')}
        onClose={() => {}}
        load={() => Promise.resolve([])}
      />,
    )
    expect(await screen.findByText(/Nothing yet/)).toBeInTheDocument()
  })
})
