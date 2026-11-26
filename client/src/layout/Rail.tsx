// SPDX-License-Identifier: AGPL-3.0-only
import { initials, useCommunityList } from '../communities/communityList'
import { Link } from '../components/Link'
import { isDesktop } from '../platform'
import { goBack, useCanGoBack } from '../router'
import { totalUnread, useConversations } from '../social/conversationsStore'
import { Icon } from '../ui/Icon'

const count = (n: number) => (n > 99 ? '99+' : String(n))

/**
 * The far left (ADR 0016): Home (friends and direct messages), every
 * community, and creating or joining one. Unread counts as badges.
 */
export function Rail({ path }: { path: string }) {
  const communities = useCommunityList()
  const homeUnread = totalUnread(useConversations())
  const canGoBack = useCanGoBack()
  const onHome = path === '/' || path.startsWith('/friends') || path.startsWith('/messages')

  return (
    <nav className="rail" aria-label="Communities">
      {/* The desktop app has no browser back button of its own. */}
      {isDesktop && canGoBack && (
        <button
          type="button"
          className="icon-button"
          aria-label="Back"
          title="Back"
          onClick={goBack}
        >
          <Icon name="back" />
        </button>
      )}
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
        const unread = c.unread ?? 0
        return (
          <Link
            key={c.id}
            to={`/c/${c.id}`}
            className="rail-item"
            aria-label={unread ? `${c.name}, ${unread} unread` : c.name}
            title={c.name}
            aria-current={path.startsWith(`/c/${c.id}`) ? 'page' : undefined}
          >
            {initials(c.name)}
            {unread > 0 && <span className="unread-count">{count(unread)}</span>}
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
