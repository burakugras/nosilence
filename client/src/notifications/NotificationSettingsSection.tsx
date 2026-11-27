// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { askWebNotificationPermission, isDesktop, webNotificationPermission } from '../platform'
import { updateNotificationSettings, useNotificationSettings } from './notifications'

/**
 * Settings → Notifications, on the desktop and on the web (ADR 0014, 0018).
 * Levels for single communities, channels and conversations are set from their
 * own menus.
 */
export function NotificationSettingsSection() {
  const settings = useNotificationSettings()
  const [permission, setPermission] = useState(webNotificationPermission)

  return (
    <section aria-label="Notifications" className="stack-form">
      <h2>Notifications</h2>
      {!isDesktop && permission === 'unsupported' && (
        <p className="muted">This browser cannot show notifications.</p>
      )}
      {!isDesktop && permission === 'denied' && (
        <p className="form-info">
          Notifications are blocked for this site. Allow them in the browser&apos;s site settings
          (the icon next to the address).
        </p>
      )}
      {!isDesktop && permission === 'default' && (
        <p>
          <button
            type="button"
            onClick={() =>
              void askWebNotificationPermission().then(() =>
                setPermission(webNotificationPermission()),
              )
            }
          >
            Allow notifications in this browser
          </button>
        </p>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => updateNotificationSettings({ enabled: e.target.checked })}
        />
        Notify me of new messages while Nosilence is in the background
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={settings.preview}
          disabled={!settings.enabled}
          onChange={(e) => updateNotificationSettings({ preview: e.target.checked })}
        />
        {isDesktop
          ? 'Show the message text (Windows keeps notifications, so others at this computer may read them)'
          : 'Show the message text (the system may keep notifications, so others at this computer may read them)'}
      </label>
      <p className="muted">
        To change how a community, a channel or a conversation notifies you, use the bell in its
        menu. Do not disturb (your status, bottom left) silences everything.
      </p>
    </section>
  )
}
