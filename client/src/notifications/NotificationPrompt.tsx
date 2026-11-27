// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { askWebNotificationPermission, webNotificationPermission } from '../platform'

const DISMISSED_KEY = 'nosilence.notificationPrompt'

function dismissed() {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'dismissed'
  } catch {
    return true
  }
}

/**
 * Web, once (ADR 0018): offers browser notifications until the user answers.
 * The browser's own question appears only after "Turn on" is clicked.
 */
export function NotificationPrompt() {
  const [hidden, setHidden] = useState(
    () => dismissed() || webNotificationPermission() !== 'default',
  )
  if (hidden) return null

  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'dismissed')
    } catch {
      // Private mode: it shows again next time.
    }
    setHidden(true)
  }

  return (
    <div className="notification-prompt" role="region" aria-label="Notifications">
      <span>Get a notification for new messages while Nosilence is in another tab?</span>
      <button type="button" onClick={() => void askWebNotificationPermission().finally(close)}>
        Turn on
      </button>
      <button type="button" className="secondary" onClick={close}>
        Not now
      </button>
    </div>
  )
}
