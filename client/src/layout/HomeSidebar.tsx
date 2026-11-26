// SPDX-License-Identifier: AGPL-3.0-only
import { Link } from '../components/Link'
import { conversationTitle, useConversations } from '../social/conversationsStore'
import { Avatar } from '../ui/Avatar'
import { Icon } from '../ui/Icon'

/** Home's channel column: friends and direct messages (ADR 0016). */
export function HomeSidebar({ path, currentUserId }: { path: string; currentUserId: string }) {
  const conversations = useConversations()
  return (
    <>
      <div className="side-header">
        <span>Home</span>
      </div>
      <nav className="side-list" aria-label="Home">
        <Link
          to="/"
          className="side-item"
          aria-current={path === '/' || path === '/friends' ? 'page' : undefined}
        >
          <Icon name="people" />
          <span className="name">Friends</span>
        </Link>
        <p className="section-title">
          Direct messages
          <Link to="/messages" className="link-button" aria-label="New group" title="New group">
            <Icon name="plus" />
          </Link>
        </p>
        {conversations === undefined ? (
          <p className="muted section-title">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="muted" style={{ padding: '0 8px', fontSize: 13 }}>
            No conversations yet. Message a friend or someone in your communities.
          </p>
        ) : (
          conversations.map((c) => {
            const title = conversationTitle(c, currentUserId)
            const other = c.members.find((m) => m.id !== currentUserId)
            return (
              <Link
                key={c.id}
                to={`/messages/${c.id}`}
                className={c.unread > 0 ? 'side-item unread' : 'side-item'}
                aria-current={path === `/messages/${c.id}` ? 'page' : undefined}
                aria-label={c.unread > 0 ? `${title}, ${c.unread} unread` : title}
              >
                {c.kind === 'group' || !other ? (
                  <Avatar id={c.id} name={String(c.members.length)} size="small" />
                ) : (
                  <Avatar
                    id={other.id}
                    name={other.display_name}
                    size="small"
                    avatar={other.avatar}
                  />
                )}
                <span className="name">{title}</span>
                {c.unread > 0 && (
                  <span className="unread-count" aria-hidden="true">
                    {c.unread > 99 ? '99+' : c.unread}
                  </span>
                )}
              </Link>
            )
          })
        )}
      </nav>
    </>
  )
}
