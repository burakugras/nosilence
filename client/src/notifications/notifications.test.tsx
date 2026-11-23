// SPDX-License-Identifier: AGPL-3.0-only
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MessageNotice } from '../gateway/types'
import { NotificationSettingsSection } from './NotificationSettingsSection'
import {
  getNotificationSettings,
  noticeToNotification,
  resetNotificationSettingsForTests,
} from './notifications'

const notice: MessageNotice = {
  message_id: 'm1',
  community_id: 'c1',
  community_name: 'Ekip',
  channel_id: 't1',
  channel_name: 'general',
  author_name: 'Ayşe',
  text: 'Akşam  oyuna\ngeliyor musun?',
}

describe('message notifications', () => {
  beforeEach(() => {
    localStorage.clear()
    resetNotificationSettingsForTests()
  })

  it('names the author and channel but not the text by default', () => {
    expect(noticeToNotification(notice, getNotificationSettings(), false)).toEqual({
      title: 'Ayşe in #general',
      body: 'Ekip',
    })
  })

  it('shows the text only when the user asks for it, shortened', () => {
    const settings = { enabled: true, preview: true }
    expect(noticeToNotification(notice, settings, false)?.body).toBe('Akşam oyuna geliyor musun?')
    const long = { ...notice, text: 'a'.repeat(300) }
    expect(noticeToNotification(long, settings, false)?.body).toHaveLength(120)
  })

  it('stays quiet while the app is in front or when turned off', () => {
    expect(noticeToNotification(notice, getNotificationSettings(), true)).toBeNull()
    expect(noticeToNotification(notice, { enabled: false, preview: true }, false)).toBeNull()
  })

  it('the settings are kept on this device', () => {
    render(<NotificationSettingsSection />)
    const preview = screen.getByRole('checkbox', { name: /Show the message text/ })
    expect(preview).not.toBeChecked()
    fireEvent.click(preview)
    fireEvent.click(screen.getByRole('checkbox', { name: /Notify me of new messages/ }))
    expect(preview).toBeDisabled()

    resetNotificationSettingsForTests()
    expect(getNotificationSettings()).toEqual({ enabled: false, preview: true })
  })
})
