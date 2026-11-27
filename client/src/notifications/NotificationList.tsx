// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { listRecentNotifications, type RecentNotification } from '../api/notificationSettings'
import { navigate } from '../router'
import { Avatar } from '../ui/Avatar'
import { Popover } from '../ui/Popover'

const time = (iso: string) => {
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * The bell next to a community's name (Burak's choice, ADR 0019): the last ten
 * messages that notify the user at their levels, one line each, unread ones in
 * bold. Clicking one opens its channel.
 */
export function NotificationList({
  communityId,
  communityName,
  anchor,
  onClose,
  load = listRecentNotifications,
}: {
  communityId: string
  communityName: string
  anchor: HTMLElement
  onClose: () => void
  load?: typeof listRecentNotifications
}) {
  const [items, setItems] = useState<RecentNotification[] | null>()

  useEffect(() => {
    let live = true
    load(communityId)
      .then((list) => live && setItems(list))
      .catch(() => live && setItems(null))
    return () => {
      live = false
    }
  }, [communityId, load])

  return (
    <Popover
      anchor={anchor}
      label={`Notifications in ${communityName}`}
      className="notification-list"
      onClose={onClose}
    >
      <p className="popover-title">Notifications</p>
      {items === undefined ? (
        <p className="muted" role="status">
          Loading…
        </p>
      ) : items === null ? (
        <p className="muted" role="alert">
          Could not load the notifications.
        </p>
      ) : items.length === 0 ? (
        <p className="muted">Nothing yet. New messages that notify you show up here.</p>
      ) : (
        <ul className="plain-list">
          {items.map((n) => (
            <li key={n.message_id}>
              <button
                type="button"
                className={n.unread ? 'notification-row unread' : 'notification-row'}
                title={`${n.author.display_name} in #${n.channel_name}: ${n.text}`}
                onClick={() => {
                  onClose()
                  navigate(`/c/${communityId}/${n.channel_id}`)
                }}
              >
                <Avatar
                  id={n.author.id}
                  name={n.author.display_name}
                  avatar={n.author.avatar}
                  size="small"
                />
                <span className="line">
                  <strong>{n.author.display_name}</strong>
                  <span className="where"> · #{n.channel_name}</span>
                  <span className="what">: {n.text.replace(/\s+/g, ' ')}</span>
                </span>
                {n.mentioned && (
                  <span className="mention-mark" aria-label="mentions you">
                    @
                  </span>
                )}
                <time dateTime={n.inserted_at}>{time(n.inserted_at)}</time>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  )
}
