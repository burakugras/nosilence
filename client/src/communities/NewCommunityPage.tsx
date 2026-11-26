// SPDX-License-Identifier: AGPL-3.0-only
import { useState, type FormEvent } from 'react'
import { useSubmit } from '../accounts/useSubmit'
import { createCommunity } from '../api/communities'
import { Field, FormMessage } from '../components/Field'
import { navigate } from '../router'
import { collect, nameError } from '../validation'
import { refreshCommunities } from './communityList'
import { inviteToken } from './inviteLink'

/** The rail's "+": create a community, or join one with an invite link. */
export function NewCommunityPage() {
  const [name, setName] = useState('')
  const { busy, errors, message, run } = useSubmit()
  const [invite, setInvite] = useState('')
  const [inviteError, setInviteError] = useState<string>()

  function openInvite(event: FormEvent) {
    event.preventDefault()
    const token = inviteToken(invite)
    if (!token) return setInviteError('Paste the whole invite link you were sent.')
    navigate(`/invite?token=${encodeURIComponent(token)}`)
  }

  function create(event: FormEvent) {
    event.preventDefault()
    void run(collect({ name: nameError(name, 50) }), async () => {
      const created = await createCommunity(name.trim())
      await refreshCommunities()
      navigate(`/c/${created.id}`)
    })
  }

  return (
    <section>
      <h3>Join with an invite</h3>
      <form
        className="stack-form"
        onSubmit={openInvite}
        noValidate
        aria-label="Join with an invite"
      >
        <Field
          label="Invite link"
          value={invite}
          onChange={(e) => {
            setInvite(e.target.value)
            setInviteError(undefined)
          }}
          error={inviteError}
        />
        <button type="submit">Open invite</button>
      </form>

      <h3>Create a community</h3>
      <form className="stack-form" onSubmit={create} noValidate aria-label="Create a community">
        <Field
          label="Community name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create community'}
        </button>
        <FormMessage text={message} />
      </form>
    </section>
  )
}
