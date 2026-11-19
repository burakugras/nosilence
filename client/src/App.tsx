// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { CompleteSignupPage } from './accounts/CompleteSignupPage'
import { ConfirmPage } from './accounts/ConfirmPage'
import { LoginPage } from './accounts/LoginPage'
import { ForgotPasswordPage, ResetPasswordPage } from './accounts/PasswordResetPages'
import { RegisterPage } from './accounts/RegisterPage'
import { currentUser, signOut, type User } from './api/accounts'
import { ApiError } from './api/http'
import { requestVoiceJoin, type VoiceJoin } from './api/voice'
import { navigate, useLocation } from './router'
import { JoinForm } from './voice/JoinForm'

// LiveKit is large; load it only when the user joins a room so the first page stays fast.
const VoiceRoom = lazy(() => import('./voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

type Props = {
  loadUser?: () => Promise<User | null>
  join?: typeof requestVoiceJoin
}

export default function App({ loadUser = currentUser, join = requestVoiceJoin }: Props) {
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
      navigate('/', { replace: true })
    }
    const page =
      path === '/complete-signup' ? (
        <CompleteSignupPage onSignedIn={onSignedIn} />
      ) : path === '/register' ? (
        <RegisterPage />
      ) : path === '/forgot-password' ? (
        <ForgotPasswordPage />
      ) : (
        <LoginPage onSignedIn={onSignedIn} googleError={params.get('error')} />
      )
    return <Shell>{page}</Shell>
  }

  return (
    <Shell
      user={user}
      onSignOut={async () => {
        await signOut()
        setUser(null)
        navigate('/login', { replace: true })
      }}
    >
      <Home user={user} join={join} />
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
            {user.display_name}{' '}
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

function Home({ user, join }: { user: User; join: typeof requestVoiceJoin }) {
  const [session, setSession] = useState<VoiceJoin>()
  const [busy, setBusy] = useState(false)
  const [roomError, setRoomError] = useState<string>()
  const [message, setMessage] = useState<string>()

  async function handleJoin(room: string) {
    setBusy(true)
    setRoomError(undefined)
    setMessage(undefined)
    try {
      setSession(await join(room))
    } catch (error) {
      if (error instanceof ApiError) {
        setRoomError(error.field('room'))
        setMessage(error.message)
      } else {
        setMessage('Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (session) {
    return (
      <Suspense fallback={<p>Connecting…</p>}>
        <VoiceRoom join={session} onLeave={() => setSession(undefined)} />
      </Suspense>
    )
  }

  return (
    <section>
      <p>Signed in as {user.email}. Pick a room to talk in.</p>
      <JoinForm onJoin={handleJoin} busy={busy} serverError={roomError} message={message} />
    </section>
  )
}
