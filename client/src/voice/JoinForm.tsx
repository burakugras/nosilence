// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import type { FieldErrors } from '../api/voice'
import { validate } from './validation'

type Props = {
  onJoin: (room: string, name: string) => void
  busy?: boolean
  serverErrors?: FieldErrors
  message?: string
}

export function JoinForm({ onJoin, busy = false, serverErrors = {}, message }: Props) {
  const [room, setRoom] = useState('lobby')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    const found = validate(room, name)
    setErrors(found)
    if (Object.keys(found).length === 0) onJoin(room, name.trim())
  }

  const roomError = errors.room ?? serverErrors.room
  const nameError = errors.name ?? serverErrors.name

  return (
    <form className="join-form" onSubmit={submit} noValidate>
      <label>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={64}
          autoComplete="nickname"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'name-error' : undefined}
        />
      </label>
      {nameError && (
        <p id="name-error" className="field-error">
          {nameError}
        </p>
      )}

      <label>
        Room
        <input
          value={room}
          onChange={(e) => setRoom(e.target.value)}
          maxLength={32}
          aria-invalid={roomError ? true : undefined}
          aria-describedby={roomError ? 'room-error' : undefined}
        />
      </label>
      {roomError && (
        <p id="room-error" className="field-error">
          {roomError}
        </p>
      )}

      <button type="submit" disabled={busy}>
        {busy ? 'Joining…' : 'Join voice room'}
      </button>
      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}
    </form>
  )
}
