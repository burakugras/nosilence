// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import type { StatusChoice, User } from '../api/accounts'
import { ApiError } from '../api/http'
import { saveStatus } from '../api/profile'
import { FormMessage } from '../components/Field'
import { setMyProfile, useMyProfile } from '../presence/myProfile'
import { endOf, liveStatusText, type Ending, type Status } from '../presence/status'
import { openUserSettings } from '../settings/settingsDialog'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'
import { Popover } from '../ui/Popover'
import { toggleDeafen, toggleMute, useControls } from '../voice/callState'

const CHOICES: { value: StatusChoice; label: string; hint: string; dot: Status }[] = [
  { value: 'online', label: 'Online', hint: 'Idle by itself after 10 minutes away', dot: 'online' },
  { value: 'dnd', label: 'Do not disturb', hint: 'No notifications', dot: 'dnd' },
  { value: 'invisible', label: 'Invisible', hint: 'You appear offline', dot: 'offline' },
]

const dotOf = (choice: StatusChoice): Status =>
  CHOICES.find((c) => c.value === choice)?.dot ?? 'online'

/** Bottom left: who is signed in, status, mute, deafen and settings (ADR 0016, 0017). */
export function UserPanel({ user }: { user: User }) {
  const { muted, deafened } = useControls()
  const profile = useMyProfile()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const text = liveStatusText(profile.status_text, profile.status_expires_at)
  return (
    <div className="user-panel" aria-label="You">
      <button
        type="button"
        className="who-button"
        aria-haspopup="dialog"
        aria-label={`Set your status (${CHOICES.find((c) => c.value === profile.status)?.label})`}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
      >
        <Avatar
          id={user.id}
          name={user.display_name}
          avatar={profile.avatar}
          status={dotOf(profile.status)}
        />
        <span className="who">
          <strong>{user.display_name}</strong>
          <span>{text ?? (user.username ? `@${user.username}` : '')}</span>
        </span>
      </button>
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
      {anchor && <StatusMenu userId={user.id} anchor={anchor} onClose={() => setAnchor(null)} />}
    </div>
  )
}

function StatusMenu({
  userId,
  anchor,
  onClose,
}: {
  userId: string
  anchor: HTMLElement
  onClose: () => void
}) {
  const profile = useMyProfile()
  const current = liveStatusText(profile.status_text, profile.status_expires_at) ?? ''
  const [text, setText] = useState(current)
  const [ending, setEnding] = useState<Ending>('never')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function save(change: {
    status?: StatusChoice
    text?: string
    expires_at?: string | null
  }) {
    setBusy(true)
    setError(undefined)
    try {
      const user = await saveStatus({
        status: change.status ?? profile.status,
        text: change.text ?? current,
        expires_at: change.expires_at !== undefined ? change.expires_at : profile.status_expires_at,
      })
      setMyProfile({ ...user, id: userId })
      return true
    } catch (e) {
      setError(e instanceof ApiError ? (e.field('status_text') ?? e.message) : 'Could not save.')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (await save({ text: text.trim(), expires_at: text.trim() ? endOf(ending) : null })) onClose()
  }

  return (
    <Popover
      anchor={anchor}
      side="above"
      label="Your status"
      className="status-menu"
      onClose={onClose}
    >
      <div className="menu" role="radiogroup" aria-label="Status">
        {CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={profile.status === c.value}
            disabled={busy}
            onClick={() => void save({ status: c.value })}
          >
            <span className={`presence-dot ${c.dot}`} aria-hidden="true" />
            <span className="status-option">
              <span>{c.label}</span>
              <span className="hint">{c.hint}</span>
            </span>
          </button>
        ))}
      </div>
      <form className="status-text-form" onSubmit={(e) => void onSubmit(e)}>
        <label>
          <span>Status text</span>
          <input
            value={text}
            maxLength={60}
            placeholder="What are you up to?"
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label>
          <span>Clear after</span>
          <select value={ending} onChange={(e) => setEnding(e.target.value as Ending)}>
            <option value="never">Never</option>
            <option value="1h">1 hour</option>
            <option value="4h">4 hours</option>
            <option value="today">Today</option>
          </select>
        </label>
        <div className="row-buttons">
          <button type="submit" disabled={busy}>
            Save
          </button>
          {current && (
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() =>
                void save({ text: '', expires_at: null }).then((ok) => ok && onClose())
              }
            >
              Clear
            </button>
          )}
        </div>
        <FormMessage text={error} />
      </form>
    </Popover>
  )
}
