// SPDX-License-Identifier: AGPL-3.0-only
import { updateNotificationSettings, useNotificationSettings } from './notifications'

/** Settings page, desktop app only. */
export function NotificationSettingsSection() {
  const settings = useNotificationSettings()
  return (
    <section aria-label="Notifications" className="stack-form">
      <h3>Notifications</h3>
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
        Show the message text (Windows keeps notifications, so others at this computer may read
        them)
      </label>
    </section>
  )
}
