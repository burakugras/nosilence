// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { acceptInvite, previewInvite } from '../api/communities'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'
import { Link } from '../components/Link'
import { navigate } from '../router'
import { refreshCommunities } from './communityList'

/** Opened from an invite link: /invite?token=... (signed-in users only). */
export function InvitePage({ token }: { token: string | null }) {
  // Without a token there is nothing to check: start in the invalid state.
  const [community, setCommunity] = useState<{ id: string; name: string } | null | undefined>(
    token ? undefined : null,
  )
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    if (!token) return
    previewInvite(token)
      .then(setCommunity)
      .catch(() => setCommunity(null))
  }, [token])

  async function accept() {
    if (!token) return
    setBusy(true)
    try {
      const joined = await acceptInvite(token)
      // The rail shows the new community.
      await refreshCommunities()
      navigate(`/c/${joined.id}`, { replace: true })
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not join.')
      setBusy(false)
    }
  }

  if (community === undefined) return <p role="status">Checking the invite…</p>
  if (community === null) {
    return (
      <section>
        <h2>Invite</h2>
        <p role="alert">This invite is invalid, has expired or has been used up.</p>
        <Link to="/">Back to your communities</Link>
      </section>
    )
  }

  return (
    <section>
      <h2>Join {community.name}?</h2>
      <p>You were invited to this community.</p>
      <button type="button" disabled={busy} onClick={() => void accept()}>
        {busy ? 'Joining…' : `Join ${community.name}`}
      </button>
      <FormMessage text={message} />
    </section>
  )
}
