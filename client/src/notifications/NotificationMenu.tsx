// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import type { Level, LevelTarget } from '../api/notificationSettings'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'
import { Icon, type IconName } from '../ui/Icon'
import { Popover } from '../ui/Popover'
import { saveLevel, settingOf, useLevels } from './levels'

type Duration = 'forever' | '1h' | '8h' | '24h'

const LEVELS: { value: Level; label: string; hint: string; icon: IconName }[] = [
  { value: 'all', label: 'All messages', hint: 'Every new message', icon: 'bell' },
  {
    value: 'mentions',
    label: 'Only mentions',
    hint: '@you, @everyone and @here',
    icon: 'at',
  },
  { value: 'none', label: 'Nothing', hint: 'No notifications at all', icon: 'bellOff' },
]

const DURATIONS: { value: Duration; label: string }[] = [
  { value: '1h', label: '1 hour' },
  { value: '8h', label: '8 hours' },
  { value: '24h', label: '24 hours' },
  { value: 'forever', label: 'Until I change it' },
]

const untilOf = (d: Duration) =>
  d === 'forever'
    ? null
    : new Date(Date.now() + { '1h': 1, '8h': 8, '24h': 24 }[d] * 3_600_000).toISOString()

/**
 * How a community, a channel or a conversation notifies (ADR 0018, 0019): the
 * level as cards, how long as a row of choices. A channel can also follow its
 * community ("Default").
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

  const options: { value: Level | 'default'; label: string; hint: string; icon: IconName }[] =
    defaultLabel
      ? [
          {
            value: 'default',
            label: 'Default',
            hint: `As the community: ${defaultLabel}`,
            icon: 'people',
          },
          ...LEVELS,
        ]
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
        <header className="popover-header">
          <span className="popover-title">Notifications</span>
          <span className="popover-subtitle">{name}</span>
        </header>
        <div className="level-cards" role="radiogroup" aria-label="Notify me about">
          {options.map((o) => (
            <label key={o.value} className={level === o.value ? 'level-card on' : 'level-card'}>
              <input
                type="radio"
                name="level"
                value={o.value}
                checked={level === o.value}
                onChange={() => setLevel(o.value)}
              />
              <Icon name={o.icon} />
              <span className="level-text">
                <span className="level-label">{o.label}</span>
                <span className="level-hint">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {level !== 'default' && (
          <div className="duration" role="radiogroup" aria-label="For how long">
            <span className="duration-title">For how long</span>
            <div className="segmented">
              {DURATIONS.map((d) => (
                <label key={d.value} className={duration === d.value ? 'on' : undefined}>
                  <input
                    type="radio"
                    name="duration"
                    value={d.value}
                    checked={duration === d.value}
                    onChange={() => setDuration(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        )}
        {current?.until && (
          <p className="muted until-note">
            Now set until{' '}
            {new Date(current.until).toLocaleString([], {
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            .
          </p>
        )}
        <FormMessage text={error} />
        <div className="popover-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Popover>
  )
}
