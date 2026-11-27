// SPDX-License-Identifier: AGPL-3.0-only
import { NotificationPrompt } from '../notifications/NotificationPrompt'
import { isDesktop } from '../platform'
import { useState, type ReactNode } from 'react'
import type { User } from '../api/accounts'
import { CommunityMain } from '../communities/CommunityMain'
import { CommunityProvider } from '../communities/CommunityProvider'
import { CommunitySettingsDialog } from '../communities/CommunitySettingsDialog'
import { CommunitySidebar } from '../communities/CommunitySidebar'
import { InvitePage } from '../communities/InvitePage'
import { MembersColumn } from '../communities/MembersColumn'
import { NewCommunityPage } from '../communities/NewCommunityPage'
import { OwnershipOffers } from '../communities/OwnershipOffers'
import { Link } from '../components/Link'
import { useOpenDialog } from '../settings/settingsDialog'
import { ConversationPage } from '../social/ConversationPage'
import { FriendsPage } from '../social/FriendsPage'
import { MessagesPage } from '../social/MessagesPage'
import { Icon, type IconName } from '../ui/Icon'
import { HomeSidebar } from './HomeSidebar'
import { Rail } from './Rail'
import { UserPanel } from './UserPanel'
import { VoicePanel } from './VoicePanel'

const COMMUNITY_PATH = /^\/c\/([0-9a-f-]{36})(?:\/([0-9a-f-]{36}))?$/
const CONVERSATION_PATH = /^\/messages\/([0-9a-f-]{36})$/
const MEMBERS_HIDDEN = 'nosilence.members-hidden'

function readMembersHidden() {
  try {
    return localStorage.getItem(MEMBERS_HIDDEN) === '1'
  } catch {
    return false
  }
}

const narrow = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 1000px)').matches

/**
 * Signed in (ADR 0016): the rail, a channel column (Home or a community), the
 * page, and a community's members. Narrow windows hide the members, then the
 * channel column, behind buttons.
 */
export function AppLayout({
  user,
  path,
  params,
}: {
  user: User
  path: string
  params: URLSearchParams
}) {
  const [membersHidden, setMembersHidden] = useState(readMembersHidden)
  // Narrow windows: the drawer open on this page (moving to another closes it).
  const [drawer, setDrawer] = useState<{ which: 'side' | 'members'; path: string } | null>(null)
  const sideOpen = drawer?.which === 'side' && drawer.path === path
  const membersOpen = drawer?.which === 'members' && drawer.path === path
  const toggleDrawer = (which: 'side' | 'members') =>
    setDrawer((d) => (d?.which === which && d.path === path ? null : { which, path }))
  const dialog = useOpenDialog()

  function toggleMembers() {
    if (narrow()) return toggleDrawer('members')
    setMembersHidden((hidden) => {
      try {
        localStorage.setItem(MEMBERS_HIDDEN, hidden ? '0' : '1')
      } catch {
        // Not kept: fine for this session.
      }
      return !hidden
    })
  }

  const menuButton = (
    <button
      type="button"
      className="icon-button only-narrow"
      aria-label="Channels"
      aria-expanded={sideOpen}
      onClick={() => toggleDrawer('side')}
    >
      <Icon name="menu" />
    </button>
  )

  const community = COMMUNITY_PATH.exec(path)
  const conversation = CONVERSATION_PATH.exec(path)

  // `members`: the members column, or 'placeholder' for its empty place while
  // a community loads (the page does not jump when it appears).
  const layout = (side: ReactNode, main: ReactNode, members: boolean | 'placeholder') => (
    <div
      className={[
        'app-layout',
        (!members || membersHidden) && 'no-members',
        sideOpen && 'show-side',
        membersOpen && 'show-members',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Rail path={path} />
      <aside className="sidebar" aria-label="Channels">
        {side}
        <VoicePanel />
        <UserPanel user={user} />
      </aside>
      <main className="main">
        {!isDesktop && <NotificationPrompt />}
        {main}
      </main>
      {members &&
        (!membersHidden || membersOpen) &&
        (members === 'placeholder' ? (
          <aside className="members" aria-label="Members" aria-busy="true" />
        ) : (
          <MembersColumn />
        ))}
    </div>
  )

  const home = <HomeSidebar path={path} currentUserId={user.id} />

  if (community) {
    return (
      <CommunityProvider
        key={community[1]}
        communityId={community[1]}
        channelId={community[2]}
        currentUserId={user.id}
        loading={layout(
          <div className="side-header" />,
          <p className="empty" role="status">
            Loading…
          </p>,
          'placeholder',
        )}
        notFound={layout(
          home,
          <Page title="Community not found" icon="hash" menuButton={menuButton}>
            <p>It does not exist, or you are not a member any more.</p>
            <Link to="/">Back home</Link>
          </Page>,
          false,
        )}
      >
        {layout(
          <CommunitySidebar />,
          <CommunityMain menuButton={menuButton} onToggleMembers={toggleMembers} />,
          true,
        )}
        {dialog?.kind === 'community' && dialog.communityId === community[1] && (
          <CommunitySettingsDialog section={dialog.section} />
        )}
      </CommunityProvider>
    )
  }

  if (conversation)
    return layout(
      home,
      <ConversationPage
        key={conversation[1]}
        id={conversation[1]}
        currentUserId={user.id}
        menuButton={menuButton}
      />,
      false,
    )

  const page =
    path === '/new' ? (
      <Page title="Create or join a community" icon="plus" menuButton={menuButton}>
        <NewCommunityPage />
      </Page>
    ) : path === '/messages' ? (
      <Page title="New group" icon="people" menuButton={menuButton}>
        <MessagesPage />
      </Page>
    ) : path === '/invite' ? (
      <Page title="Invite" icon="invite" menuButton={menuButton}>
        <InvitePage token={params.get('token')} />
      </Page>
    ) : (
      <Page title="Friends" icon="people" menuButton={menuButton}>
        <OwnershipOffers />
        <FriendsPage />
      </Page>
    )
  return layout(home, page, false)
}

/** A page in the middle column: a header and scrolling content. */
function Page({
  title,
  icon,
  menuButton,
  children,
}: {
  title: string
  icon: IconName
  menuButton: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <header className="main-header">
        {menuButton}
        <h1>
          <Icon name={icon} />
          {title}
        </h1>
      </header>
      <div className="main-scroll">
        <section aria-label={title}>{children}</section>
      </div>
    </>
  )
}
