// SPDX-License-Identifier: AGPL-3.0-only
import { onDeepLink } from './platform'
import { inviteToken } from './communities/inviteLink'
import { followLevels } from './notifications/levels'
import { startIdleWatch } from './presence/idle'
import { clearMyProfile, setMyProfile } from './presence/myProfile'
import { useEffect, useState, type ReactNode } from 'react'
import { CompleteSignupForm, CompleteSignupPage } from './accounts/CompleteSignupPage'
import { ConfirmPage } from './accounts/ConfirmPage'
import { setPendingDesktopSignup, usePendingDesktopSignup } from './accounts/desktopSignup'
import { LoginPage } from './accounts/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './accounts/PasswordResetPages'
import { RegisterPage } from './accounts/RegisterPage'
import { currentUser, signOut, type User } from './api/accounts'
import { followCommunities } from './communities/communityList'
import { startUserLive } from './gateway/userLive'
import { AppLayout } from './layout/AppLayout'
import { startMessageNotifications } from './notifications/notifications'
import { isDesktop } from './platform'
import { navigate, useLocation } from './router'
import { openUserSettings, useOpenDialog } from './settings/settingsDialog'
import { UserSettingsDialog } from './settings/UserSettingsDialog'
import { ChooseUsernamePage } from './social/ChooseUsernamePage'
import { followConversations } from './social/conversationsStore'
import { checkOnStart } from './updates/updates'
import { UpdateBanner, UpdateCorner } from './updates/UpdateViews'
import { ActiveCall } from './voice/ActiveCall'
import { endCall } from './voice/call'

type Props = {
  loadUser?: () => Promise<User | null>
}

export default function App({ loadUser = currentUser }: Props) {
  // undefined while loading, null when signed out
  const [user, setUser] = useState<User | null>()
  const { path, params } = useLocation()
  const desktopSignup = usePendingDesktopSignup()
  const dialog = useOpenDialog()

  useEffect(() => {
    loadUser()
      .then(setUser)
      .catch(() => setUser(null))
  }, [loadUser])

  // Desktop: look for updates, signed in or not (ADR 0014).
  useEffect(checkOnStart, [])
  // Desktop: a nosilence:// invite link opens the invite, which still asks
  // before joining (ADR 0018). Signed out, it continues after signing in.
  useEffect(
    () =>
      onDeepLink((url) => {
        const token = inviteToken(url)
        if (token) navigate(`/invite?token=${encodeURIComponent(token)}`)
      }),
    [],
  )

  // The user's own live topic (friends, conversations; ADR 0015), the lists
  // behind the unread badges, and on the desktop notifications for others'
  // messages (ADR 0014). Listeners attach before the topic delivers anything.
  const userId = user?.id
  // The user's own picture and status (ADR 0017), and idle on the live connections.
  useEffect(() => {
    if (user) setMyProfile(user)
    else clearMyProfile()
  }, [user])
  useEffect(() => (userId ? startIdleWatch() : undefined), [userId])
  useEffect(() => (userId ? followLevels() : undefined), [userId])
  useEffect(() => (userId ? startMessageNotifications(userId) : undefined), [userId])
  useEffect(() => (userId ? followConversations() : undefined), [userId])
  useEffect(() => (userId ? followCommunities() : undefined), [userId])
  useEffect(() => (userId ? startUserLive(userId) : undefined), [userId])
  // Signed out (or the session ended): the call ends with it.
  useEffect(() => {
    if (!userId) endCall()
  }, [userId])

  // Old addresses of the settings and account pages open the settings window.
  const signedIn = !!user?.username
  useEffect(() => {
    if (!signedIn || (path !== '/settings' && path !== '/account')) return
    openUserSettings(path === '/account' ? 'account' : 'voice')
    navigate('/', { replace: true })
  }, [signedIn, path])

  async function onSignOut() {
    await signOut()
    setUser(null)
    navigate('/login', { replace: true })
  }

  // Links from emails work whether or not the user is signed in.
  if (path === '/confirm')
    return (
      <AuthLayout>
        <ConfirmPage token={params.get('token')} />
      </AuthLayout>
    )
  if (path === '/reset-password')
    return (
      <AuthLayout>
        <ResetPasswordPage token={params.get('token')} />
      </AuthLayout>
    )

  if (user === undefined)
    return (
      <AuthLayout>
        <p role="status">Loading…</p>
      </AuthLayout>
    )

  if (user === null) {
    const onSignedIn = (signedInUser: User) => {
      setUser(signedInUser)
      // An invite link opened while signed out continues after signing in.
      if (path !== '/invite') navigate('/', { replace: true })
    }
    const page = desktopSignup ? (
      <CompleteSignupForm
        pending={desktopSignup.signup}
        complete={async (name, adult) => {
          const created = await desktopSignup.complete(name, adult)
          setPendingDesktopSignup(null)
          onSignedIn(created)
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
    return <AuthLayout>{page}</AuthLayout>
  }

  // Everyone picks a unique username once, before anything else (ADR 0015).
  if (!user.username)
    return (
      <AuthLayout>
        <ChooseUsernamePage user={user} onDone={setUser} />
        <p>
          <button type="button" className="link-button" onClick={() => void onSignOut()}>
            Sign out
          </button>
        </p>
      </AuthLayout>
    )

  return (
    <div className="app-root">
      {isDesktop && <UpdateBanner />}
      <AppLayout user={user} path={path} params={params} />
      {/* The call belongs to the app, not a page, so moving around keeps it. */}
      <ActiveCall />
      {dialog?.kind === 'user' && (
        <UserSettingsDialog
          section={dialog.section}
          user={user}
          onUserChange={setUser}
          onSignOut={() => void onSignOut()}
          onDeleted={() => {
            setUser(null)
            navigate('/login', { replace: true })
          }}
        />
      )}
    </div>
  )
}

/** Signed out: a card in the middle of the window. */
function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-root">
      {isDesktop && <UpdateBanner />}
      <main className="auth-page">
        <div className="auth-card">
          <h1 className="brand">Nosilence</h1>
          {children}
        </div>
        {isDesktop && <UpdateCorner />}
      </main>
    </div>
  )
}
