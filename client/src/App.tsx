// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type ReactNode } from 'react'
import { CompleteSignupForm, CompleteSignupPage } from './accounts/CompleteSignupPage'
import { setPendingDesktopSignup, usePendingDesktopSignup } from './accounts/desktopSignup'
import { ConfirmPage } from './accounts/ConfirmPage'
import { AccountPage } from './accounts/AccountPage'
import { LoginPage } from './accounts/LoginPage'
import { Link } from './components/Link'
import { ForgotPasswordPage, ResetPasswordPage } from './accounts/PasswordResetPages'
import { RegisterPage } from './accounts/RegisterPage'
import { currentUser, signOut, type User } from './api/accounts'
import { CommunitiesPage } from './communities/CommunitiesPage'
import { CommunityPage } from './communities/CommunityPage'
import { InvitePage } from './communities/InvitePage'
import { goBack, navigate, useCanGoBack, useLocation } from './router'
import { isDesktop } from './platform'
import { startMessageNotifications } from './notifications/notifications'
import { checkOnStart } from './updates/updates'
import { UpdateBanner, UpdateCorner } from './updates/UpdateViews'
import { ActiveCall } from './voice/ActiveCall'
import { endCall } from './voice/call'
import { SettingsPage } from './voice/SettingsPage'
import { startUserLive } from './gateway/userLive'
import { ChooseUsernamePage } from './social/ChooseUsernamePage'
import { ConversationPage } from './social/ConversationPage'
import { followConversations, totalUnread, useConversations } from './social/conversationsStore'
import { FriendsPage } from './social/FriendsPage'
import { MessagesPage } from './social/MessagesPage'

type Props = {
  loadUser?: () => Promise<User | null>
}

const COMMUNITY_PATH = /^\/c\/([0-9a-f-]{36})$/
const CONVERSATION_PATH = /^\/messages\/([0-9a-f-]{36})$/

export default function App({ loadUser = currentUser }: Props) {
  // undefined while loading, null when signed out
  const [user, setUser] = useState<User | null>()
  const { path, params } = useLocation()
  const desktopSignup = usePendingDesktopSignup()

  useEffect(() => {
    loadUser()
      .then(setUser)
      .catch(() => setUser(null))
  }, [loadUser])

  // The user's own live topic (friends, conversations; ADR 0015), the
  // conversation list behind the unread badge, and on the desktop
  // notifications for others' messages (ADR 0014). Order matters: listeners
  // attach before the topic delivers anything.
  const userId = user?.id
  useEffect(() => (userId ? startMessageNotifications(userId) : undefined), [userId])
  useEffect(() => (userId ? followConversations() : undefined), [userId])
  useEffect(() => (userId ? startUserLive(userId) : undefined), [userId])
  // Signed out (or the session ended): the call ends with it.
  useEffect(() => {
    if (!userId) endCall()
  }, [userId])

  // Links from emails work whether or not the user is signed in.
  if (path === '/confirm')
    return (
      <Shell>
        <ConfirmPage token={params.get('token')} />
      </Shell>
    )
  if (path === '/reset-password')
    return (
      <Shell>
        <ResetPasswordPage token={params.get('token')} />
      </Shell>
    )

  if (user === undefined)
    return (
      <Shell>
        <p role="status">Loading…</p>
      </Shell>
    )

  if (user === null) {
    const onSignedIn = (signedIn: User) => {
      setUser(signedIn)
      // An invite link opened while signed out continues after signing in.
      if (path !== '/invite') navigate('/', { replace: true })
    }
    const page = desktopSignup ? (
      <CompleteSignupForm
        pending={desktopSignup.signup}
        complete={async (name, adult) => {
          const signedIn = await desktopSignup.complete(name, adult)
          setPendingDesktopSignup(null)
          onSignedIn(signedIn)
        }}
        onCancel={() => setPendingDesktopSignup(null)}
      />
    ) : path === '/complete-signup' ? (
      <CompleteSignupPage onSignedIn={onSignedIn} />
    ) : path === '/register' ? (
      <RegisterPage onSignedIn={onSignedIn} />
    ) : path === '/forgot-password' ? (
      <ForgotPasswordPage />
    ) : (
      <>
        {path === '/invite' && <p>Sign in to accept your invite.</p>}
        <LoginPage onSignedIn={onSignedIn} googleError={params.get('error')} />
      </>
    )
    return <Shell>{page}</Shell>
  }

  // Everyone picks a unique username once, before anything else (ADR 0015).
  if (!user.username)
    return (
      <Shell user={user} onSignOut={() => void signOut().then(() => setUser(null))}>
        <ChooseUsernamePage user={user} onDone={setUser} />
      </Shell>
    )

  const community = COMMUNITY_PATH.exec(path)
  const conversation = CONVERSATION_PATH.exec(path)
  const page =
    path === '/account' ? (
      <AccountPage
        user={user}
        onDeleted={() => {
          setUser(null)
          navigate('/login', { replace: true })
        }}
      />
    ) : path === '/settings' ? (
      <SettingsPage user={user} onUserChange={setUser} />
    ) : path === '/friends' ? (
      <FriendsPage />
    ) : path === '/messages' ? (
      <MessagesPage currentUserId={user.id} />
    ) : conversation ? (
      <ConversationPage key={conversation[1]} id={conversation[1]} currentUserId={user.id} />
    ) : path === '/invite' ? (
      <InvitePage token={params.get('token')} />
    ) : community ? (
      <CommunityPage key={community[1]} communityId={community[1]} currentUserId={user.id} />
    ) : (
      <CommunitiesPage />
    )

  return (
    <Shell
      user={user}
      onSignOut={async () => {
        await signOut()
        setUser(null)
        navigate('/login', { replace: true })
      }}
    >
      {/* Above every page, so moving around the app keeps the call. */}
      <ActiveCall />
      {page}
    </Shell>
  )
}

function Shell({
  user,
  onSignOut,
  children,
}: {
  user?: User
  onSignOut?: () => void
  children: ReactNode
}) {
  useEffect(checkOnStart, [])
  const canGoBack = useCanGoBack()
  return (
    <main className="app">
      {isDesktop && <UpdateBanner />}
      <header className="app-header">
        <h1>
          {/* The desktop app has no browser back button of its own. */}
          {isDesktop && canGoBack && (
            <button type="button" className="back-button" aria-label="Back" onClick={goBack}>
              ←
            </button>
          )}
          Nosilence
        </h1>
        {user && (
          <p>
            <MessagesLink /> <Link to="/friends">Friends</Link> <Link to="/settings">Settings</Link>{' '}
            <Link to="/account">{user.display_name}</Link>{' '}
            <button type="button" className="link-button" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </header>
      {children}
      {isDesktop && <UpdateCorner />}
    </main>
  )
}

/** "Messages", with how many messages from others are unread. */
function MessagesLink() {
  const unread = totalUnread(useConversations())
  return (
    <Link to="/messages">
      Messages
      {unread > 0 && (
        <span className="unread-count" aria-label={`${unread} unread`}>
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
