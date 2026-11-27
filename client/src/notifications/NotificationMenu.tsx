// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import type { Level, LevelTarget } from '../api/notificationSettings'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'
import { Popover } from '../ui/Popover'
import { saveLevel, settingOf, useLevels } from './levels'

type Duration = 'forever' | '1h' | '8h' | '24h'

const LEVELS: { value: Level; label: string }[] = [
  { value: 'all', label: 'All messages' },
  { value: 'mentions', label: 'Only mentions' },
  { value: 'none', label: 'Nothing' },
]

const untilOf = (d: Duration) =>
  d === 'forever'
    ? null
    : new Date(Date.now() + { '1h': 1, '8h': 8, '24h': 24 }[d] * 3_600_000).toISOString()

/**
 * How a community, a channel or a conversation notifies (ADR 0018). A channel
 * can also follow its community ("Default").
 */
export function NotificationMenu({
  type,
  id,
  name,
  defaultLabel,
  anchor,
  side,
  onClose,
}: {
  type: LevelTarget
  id: string
  name: string
  /** For a channel: what "Default" means (the community's level). */
  defaultLabel?: string
  anchor: HTMLElement
  side?: 'below' | 'left'
  onClose: () => void
}) {
  useLevels()
  const current = settingOf(type, id)
  const [level, setLevel] = useState<Level | 'default'>(
    current?.level ?? (defaultLabel ? 'default' : 'all'),
  )
  const [duration, setDuration] = useState<Duration>('forever')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      // "All messages" with no end is the default for communities and conversations.
      const plainDefault = !defaultLabel && level === 'all' && duration === 'forever'
      await saveLevel(
        type,
        id,
        plainDefault ? 'default' : level,
        level === 'default' ? null : untilOf(duration),
      )
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save.')
    } finally {
      setBusy(false)
    }
  }

  const options = defaultLabel
    ? [{ value: 'default' as const, label: `Default (${defaultLabel})` }, ...LEVELS]
    : LEVELS

  return (
    <Popover
      anchor={anchor}
      side={side}
      label={`Notifications for ${name}`}
      className="notification-menu"
      onClose={onClose}
    >
      <form onSubmit={(e) => void onSubmit(e)}>
        <fieldset>
          <legend>Notify me about</legend>
          {options.map((o) => (
            <label key={o.value} className="radio">
              <input
                type="radio"
                name="level"
                value={o.value}
                checked={level === o.value}
                onChange={() => setLevel(o.value)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>
        {level !== 'default' && (
          <label className="field-inline">
            <span>For</span>
            <select value={duration} onChange={(e) => setDuration(e.target.value as Duration)}>
              <option value="forever">Until I change it</option>
              <option value="1h">1 hour</option>
              <option value="8h">8 hours</option>
              <option value="24h">24 hours</option>
            </select>
          </label>
        )}
        {current?.until && (
          <p className="muted">
            Set until{' '}
            {new Date(current.until).toLocaleString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
        )}
        <div className="row-buttons">
          <button type="submit" disabled={busy}>
            Save
          </button>
        </div>
        <FormMessage text={error} />
      </form>
    </Popover>
  )
}
