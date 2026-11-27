// SPDX-License-Identifier: AGPL-3.0-only
import { communityLevel, useLevels } from '../notifications/levels'
import { initials, useCommunityList } from '../communities/communityList'
import { Link } from '../components/Link'
import { totalUnread, useConversations } from '../social/conversationsStore'
import { Icon } from '../ui/Icon'

const count = (n: number) => (n > 99 ? '99+' : String(n))

/**
 * The far left (ADR 0016): Home (friends and direct messages), every
 * community, and creating or joining one. A red count is for what concerns the
 * user: direct messages on Home, mentions on a community; other unread messages
 * show as a dot, except in communities set to nothing (ADR 0018).
 */
export function Rail({ path }: { path: string }) {
  const communities = useCommunityList()
  useLevels()
  const homeUnread = totalUnread(useConversations())
  const onHome = path === '/' || path.startsWith('/friends') || path.startsWith('/messages')

  return (
    <nav className="rail" aria-label="Communities">
      <Link
        to="/"
        className="rail-item"
        aria-label={homeUnread ? `Home, ${homeUnread} unread` : 'Home'}
        title="Home: friends and messages"
        aria-current={onHome ? 'page' : undefined}
      >
        <Icon name="home" />
        {homeUnread > 0 && <span className="unread-count">{count(homeUnread)}</span>}
      </Link>
      <span className="rail-divider" />
      {communities?.map((c) => {
        const mentions = c.mentions ?? 0
        const muted = communityLevel(c.id) === 'none'
        const unread = !muted && (c.unread ?? 0) > 0
        const label = mentions
          ? `${c.name}, ${mentions} ${mentions === 1 ? 'mention' : 'mentions'}`
          : unread
            ? `${c.name}, unread messages`
            : c.name
        return (
          <Link
            key={c.id}
            to={`/c/${c.id}`}
            className={muted ? 'rail-item muted' : 'rail-item'}
            aria-label={label}
            title={c.name}
            aria-current={path.startsWith(`/c/${c.id}`) ? 'page' : undefined}
          >
            {initials(c.name)}
            {mentions > 0 ? (
              <span className="unread-count">{count(mentions)}</span>
            ) : (
              unread && <span className="unread-dot" />
            )}
          </Link>
        )
      })}
      <Link
        to="/new"
        className="rail-item add"
        aria-label="Create or join a community"
        title="Create or join a community"
        aria-current={path === '/new' ? 'page' : undefined}
      >
        <Icon name="plus" />
      </Link>
    </nav>
  )
}
