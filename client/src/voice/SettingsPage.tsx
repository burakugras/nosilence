// SPDX-License-Identifier: AGPL-3.0-only
import type { User } from '../api/accounts'
import { isDesktop } from '../platform'
import { PrivacySection } from '../social/PrivacySection'
import { NotificationSettingsSection } from '../notifications/NotificationSettingsSection'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

export function SettingsPage({
  user,
  onUserChange,
}: {
  user?: User
  onUserChange?: (user: User) => void
}) {
  return (
    <section>
      <h2>Settings</h2>
      <h3>Voice</h3>
      <p className="muted">These settings belong to this device and browser.</p>
      <VoiceSettingsPanel />
      {user && onUserChange && <PrivacySection user={user} onChange={onUserChange} />}
      {isDesktop && <NotificationSettingsSection />}
    </section>
  )
}
