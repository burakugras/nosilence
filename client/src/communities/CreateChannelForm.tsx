// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { useSubmit } from '../accounts/useSubmit'
import { createChannel } from '../api/communities'
import { Field, FormMessage } from '../components/Field'
import { capacityError, collect, nameError } from '../validation'

export function CreateChannelForm({
  communityId,
  onCreated,
}: {
  communityId: string
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('8')
  const { busy, errors, message, run } = useSubmit()

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(
      collect({ name: nameError(name, 32), capacity: capacityError(capacity) }),
      async () => {
        await createChannel(communityId, name.trim(), Number(capacity))
        setName('')
        onCreated()
      },
    )
  }

  return (
    <form className="stack-form" onSubmit={submit} noValidate aria-label="New voice channel">
      <Field
        label="New channel name"
        maxLength={64}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
      />
      <Field
        label="Capacity (2-8 people)"
        type="number"
        min={2}
        max={8}
        value={capacity}
        onChange={(e) => setCapacity(e.target.value)}
        error={errors.capacity}
      />
      <button type="submit" disabled={busy}>
        {busy ? 'Adding…' : 'Add channel'}
      </button>
      <FormMessage text={message} />
    </form>
  )
}
