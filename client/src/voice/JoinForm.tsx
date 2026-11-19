// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { Field, FormMessage } from '../components/Field'
import { roomError } from '../validation'

type Props = {
  onJoin: (room: string) => void
  busy?: boolean
  serverError?: string
  message?: string
}

export function JoinForm({ onJoin, busy = false, serverError, message }: Props) {
  const [room, setRoom] = useState('lobby')
  const [error, setError] = useState<string>()

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = roomError(room)
    setError(found)
    if (!found) onJoin(room)
  }

  return (
    <form className="stack-form" onSubmit={submit} noValidate>
      <Field
        label="Room"
        value={room}
        onChange={(e) => setRoom(e.target.value)}
        maxLength={32}
        error={error ?? serverError}
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Joining…' : 'Join voice room'}
      </button>
      <FormMessage text={message} />
    </form>
  )
}
