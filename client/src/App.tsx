// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useState } from 'react'
import { requestVoiceJoin, VoiceJoinError, type FieldErrors, type VoiceJoin } from './api/voice'
import { JoinForm } from './voice/JoinForm'

// LiveKit is large; load it only when the user joins a room so the first page stays fast.
const VoiceRoom = lazy(() => import('./voice/VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

type Props = {
  join?: typeof requestVoiceJoin
}

export default function App({ join = requestVoiceJoin }: Props) {
  const [session, setSession] = useState<VoiceJoin>()
  const [busy, setBusy] = useState(false)
  const [serverErrors, setServerErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<string>()

  async function handleJoin(room: string, name: string) {
    setBusy(true)
    setServerErrors({})
    setMessage(undefined)
    try {
      setSession(await join(room, name))
    } catch (error) {
      if (error instanceof VoiceJoinError) {
        setServerErrors(error.fieldErrors)
        setMessage(error.message)
      } else {
        setMessage('Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="app">
      <h1>Nosilence</h1>
      {session ? (
        <Suspense fallback={<p>Connecting…</p>}>
          <VoiceRoom join={session} onLeave={() => setSession(undefined)} />
        </Suspense>
      ) : (
        <>
          <p>Fast, secure voice chat. Work in progress.</p>
          <JoinForm onJoin={handleJoin} busy={busy} serverErrors={serverErrors} message={message} />
        </>
      )}
    </main>
  )
}
