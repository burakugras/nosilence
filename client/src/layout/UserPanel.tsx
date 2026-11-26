// SPDX-License-Identifier: AGPL-3.0-only
import type { User } from '../api/accounts'
import { openUserSettings } from '../settings/settingsDialog'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { toggleDeafen, toggleMute, useControls } from '../voice/callState'

/** Bottom left: who is signed in, mute, deafen and settings (ADR 0016). */
export function UserPanel({ user }: { user: User }) {
  const { muted, deafened } = useControls()
  return (
    <div className="user-panel" aria-label="You">
      <Avatar id={user.id} name={user.display_name} online />
      <div className="who">
        <strong>{user.display_name}</strong>
        {user.username && <span>@{user.username}</span>}
      </div>
      <button
        type="button"
        className={muted ? 'icon-button off' : 'icon-button'}
        aria-pressed={muted}
        aria-label="Mute"
        title={muted ? 'Unmute' : 'Mute'}
        onClick={toggleMute}
      >
        <Icon name={muted ? 'micOff' : 'mic'} />
      </button>
      <button
        type="button"
        className={deafened ? 'icon-button off' : 'icon-button'}
        aria-pressed={deafened}
        aria-label="Deafen"
        title={deafened ? 'Undeafen' : 'Deafen: hear nothing'}
        onClick={toggleDeafen}
      >
        <Icon name={deafened ? 'headphonesOff' : 'headphones'} />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Settings"
        title="Settings"
        onClick={() => openUserSettings()}
      >
        <Icon name="gear" />
      </button>
    </div>
  )
}
