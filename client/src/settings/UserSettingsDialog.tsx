// SPDX-License-Identifier: AGPL-3.0-only
import type { User } from '../api/accounts'
import { AccountPage } from '../accounts/AccountPage'
import { NotificationSettingsSection } from '../notifications/NotificationSettingsSection'
import { isDesktop } from '../platform'
import { PrivacySection } from '../social/PrivacySection'
import { setThemeChoice, useThemeChoice, type ThemeChoice } from '../theme'
import { SettingsModal, type ModalSection } from '../ui/Modal'
import { AboutSection } from '../updates/UpdateViews'
import { useCallState } from '../voice/callState'
import { VoiceSettingsPanel } from '../voice/VoiceSettingsPanel'
import { closeDialog, openUserSettings, type UserSettingsSection } from './settingsDialog'

/** All of the user's settings in one window (ADR 0016). */
export function UserSettingsDialog({
  section,
  user,
  onUserChange,
  onSignOut,
  onDeleted,
}: {
  section: UserSettingsSection
  user: User
  onUserChange: (user: User) => void
  onSignOut: () => void
  onDeleted: () => void
}) {
  const { micTrack } = useCallState()
  const sections: ModalSection[] = [
    { id: 'voice', label: 'Voice' },
    ...(isDesktop ? [{ id: 'notifications', label: 'Notifications' }] : []),
    { id: 'privacy', label: 'Username and privacy' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'account', label: 'Account' },
    ...(isDesktop ? [{ id: 'about', label: 'About' }] : []),
  ]
  const current = sections.some((s) => s.id === section) ? section : 'voice'

  return (
    <SettingsModal
      title="Settings"
      sections={sections}
      current={current}
      onSection={(id) => openUserSettings(id as UserSettingsSection)}
      onClose={closeDialog}
    >
      {current === 'voice' && (
        <>
          <h2>Voice</h2>
          <p className="muted">These settings belong to this device and browser.</p>
          {/* In a call, the meter shows the microphone actually being sent. */}
          <VoiceSettingsPanel liveTrack={micTrack} />
        </>
      )}
      {current === 'notifications' && <NotificationSettingsSection />}
      {current === 'privacy' && <PrivacySection user={user} onChange={onUserChange} />}
      {current === 'appearance' && <Appearance />}
      {current === 'account' && (
        <AccountPage user={user} onDeleted={onDeleted} onSignOut={onSignOut} />
      )}
      {current === 'about' && <AboutSection />}
    </SettingsModal>
  )
}

function Appearance() {
  const choice = useThemeChoice()
  const options: [ThemeChoice, string][] = [
    ['system', 'Follow the system'],
    ['dark', 'Dark'],
    ['light', 'Light'],
  ]
  return (
    <>
      <h2>Appearance</h2>
      <fieldset className="stack-form" style={{ border: 0, padding: 0 }}>
        <legend className="section-title" style={{ padding: 0 }}>
          Theme
        </legend>
        {options.map(([value, label]) => (
          <label key={value} className="radio-label">
            <input
              type="radio"
              name="theme"
              value={value}
              checked={choice === value}
              onChange={() => setThemeChoice(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
    </>
  )
}
