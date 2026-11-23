// SPDX-License-Identifier: AGPL-3.0-only
import { isDesktop } from '../platform'
import { NotificationSettingsSection } from '../notifications/NotificationSettingsSection'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

export function SettingsPage() {
  return (
    <section>
      <h2>Settings</h2>
      <h3>Voice</h3>
      <p className="muted">These settings belong to this device and browser.</p>
      <VoiceSettingsPanel />
      {isDesktop && <NotificationSettingsSection />}
    </section>
  )
}
