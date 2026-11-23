// SPDX-License-Identifier: AGPL-3.0-only
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

export function SettingsPage() {
  return (
    <section>
      <h2>Voice settings</h2>
      <p className="muted">These settings belong to this device and browser.</p>
      <VoiceSettingsPanel />
    </section>
  )
}
