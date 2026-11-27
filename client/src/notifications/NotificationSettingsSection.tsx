// SPDX-License-Identifier: AGPL-3.0-only
import { play, updateSoundSettings, useSoundSettings } from '../sounds/sounds'
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
      <SoundSettings />
    </section>
  )
}

/** Interaction sounds (ADR 0020): how loud, and which groups. */
function SoundSettings() {
  const s = useSoundSettings()
  return (
    <fieldset className="sound-settings">
      <legend>Sounds</legend>
      {/* One row: the label, the slider and a sample (not a <label>: the form's
          label rule would stack them). */}
      <div className="volume-row">
        <label htmlFor="sound-volume">Volume</label>
        <input
          id="sound-volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={s.volume}
          aria-valuetext={`${Math.round(s.volume * 100)}%`}
          onChange={(e) => updateSoundSettings({ volume: Number(e.target.value) })}
        />
        <button type="button" className="secondary" onClick={() => play('join')}>
          Play a sample
        </button>
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={s.voice}
          onChange={(e) => updateSoundSettings({ voice: e.target.checked })}
        />
        Voice channel sounds (joining and leaving, microphone, deafen, connection)
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={s.messages}
          onChange={(e) => updateSoundSettings({ messages: e.target.checked })}
        />
        Message sounds (direct messages and mentions, while Nosilence is in front)
      </label>
    </fieldset>
  )
}
