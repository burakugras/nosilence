// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type ReactNode } from 'react'
import { CompleteSignupPage } from './accounts/CompleteSignupPage'
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
import { navigate, useLocation } from './router'
import { SettingsPage } from './voice/SettingsPage'

type Props = {
  loadUser?: () => Promise<User | null>
}

const COMMUNITY_PATH = /^\/c\/([0-9a-f-]{36})$/

export default function App({ loadUser = currentUser }: Props) {
  // undefined while loading, null when signed out
  const [user, setUser] = useState<User | null>()
  const { path, params } = useLocation()

  useEffect(() => {
    loadUser()
      .then(setUser)
      .catch(() => setUser(null))
  }, [loadUser])

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
    const page =
      path === '/complete-signup' ? (
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

  const community = COMMUNITY_PATH.exec(path)
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
      <SettingsPage />
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
  return (
    <main className="app">
      <header className="app-header">
        <h1>Nosilence</h1>
        {user && (
          <p>
            <Link to="/settings">Settings</Link> <Link to="/account">{user.display_name}</Link>{' '}
            <button type="button" className="link-button" onClick={onSignOut}>
              Sign out
            </button>
          </p>
        )}
      </header>
      {children}
    </main>
  )
}
