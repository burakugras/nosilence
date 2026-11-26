// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState, type FormEvent } from 'react'
import {
  deleteAccount,
  deletionPreview,
  downloadMyData,
  type DeletionPreview,
} from '../api/account'
import type { User } from '../api/accounts'
import { listMembers, type Member } from '../api/communities'
import { ApiError } from '../api/http'
import { choosable } from '../communities/roles'
import { Field, FormMessage } from '../components/Field'

type Props = {
  user: User
  /** The account is gone: forget the user and go to sign-in. */
  onDeleted: () => void
  onSignOut?: () => void
}

export function AccountPage({ user, onDeleted, onSignOut }: Props) {
  return (
    <section>
      <h2>Account</h2>
      <p>
        {user.display_name} · <span className="muted">{user.email}</span>
      </p>
      {onSignOut && (
        <button type="button" className="secondary" onClick={onSignOut}>
          Sign out
        </button>
      )}
      <DownloadData />
      <DeleteAccount user={user} onDeleted={onDeleted} />
    </section>
  )
}

function DownloadData() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  async function download() {
    setBusy(true)
    setMessage(undefined)
    try {
      await downloadMyData()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not download your data.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <h3>Your data</h3>
      <p>
        Download everything we hold about you: your account, memberships, messages and the sign-in
        records the law requires us to keep.
      </p>
      <button type="button" disabled={busy} onClick={() => void download()}>
        {busy ? 'Preparing…' : 'Download my data'}
      </button>
      <FormMessage text={message} />
    </>
  )
}

const KEEP_MESSAGES =
  'Your messages stay, so conversations still make sense, shown as from "Deleted user".'

function DeleteAccount({ user, onDeleted }: Props) {
  const [preview, setPreview] = useState<DeletionPreview>()
  const [confirmEmail, setConfirmEmail] = useState('')
  const [password, setPassword] = useState('')
  const [deleteMessages, setDeleteMessages] = useState(false)
  // Owned community id => chosen members (empty: delete the community).
  const [handOver, setHandOver] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    deletionPreview()
      .then(setPreview)
      .catch(() => setMessage('Could not load what deleting would remove.'))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setMessage(undefined)
    if (confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      setErrors({ confirm_email: 'Type your email address exactly.' })
      return
    }
    if (!window.confirm('Delete your account for good? This cannot be undone.')) return

    setBusy(true)
    try {
      await deleteAccount({
        confirm_email: confirmEmail,
        ...(preview?.needs_password ? { password } : {}),
        delete_messages: deleteMessages,
        hand_over: Object.fromEntries(
          Object.entries(handOver)
            .map(([id, picks]) => [id, picks.filter(Boolean)] as const)
            .filter(([, picks]) => picks.length > 0),
        ),
      })
      onDeleted()
    } catch (e) {
      if (e instanceof ApiError) {
        setErrors({ confirm_email: e.field('confirm_email'), password: e.field('password') })
        setMessage(e.message)
      } else {
        setMessage('Could not delete the account.')
      }
      setBusy(false)
    }
  }

  const owned = preview?.owned_communities ?? []

  return (
    <form
      className="stack-form danger-zone"
      onSubmit={submit}
      noValidate
      aria-label="Delete account"
    >
      <h3>Delete account</h3>
      <p>Download your data first if you want to keep a copy.</p>
      {owned.length > 0 && (
        <div role="alert">
          <p>
            Communities you own: offer each to up to three members (asked in order, 72 hours each),
            or it is deleted for everyone with all its messages. If nobody accepts, it is deleted
            after a week's notice.
          </p>
          <ul className="plain-list">
            {owned.map((c) => (
              <li key={c.id} className="hand-over">
                <span>
                  {c.name}{' '}
                  <span className="muted">
                    ({c.member_count} {c.member_count === 1 ? 'member' : 'members'})
                  </span>
                </span>
                <HandOverPicker
                  communityId={c.id}
                  selfId={user.id}
                  picks={handOver[c.id] ?? ['', '', '']}
                  onChange={(picks) => setHandOver((h) => ({ ...h, [c.id]: picks }))}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          checked={deleteMessages}
          onChange={(e) => setDeleteMessages(e.target.checked)}
        />{' '}
        Also delete my messages in other communities
      </label>
      <p className="muted">
        {deleteMessages ? 'Your messages will be removed everywhere.' : KEEP_MESSAGES} Sign-in
        records are kept for one year, as the law requires.
      </p>
      <Field
        label="Type your email to confirm"
        type="email"
        autoComplete="off"
        value={confirmEmail}
        onChange={(e) => setConfirmEmail(e.target.value)}
        error={errors.confirm_email}
      />
      {preview?.needs_password && (
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
      )}
      <button type="submit" className="danger" disabled={busy || !preview}>
        {busy ? 'Deleting…' : 'Delete my account'}
      </button>
      <FormMessage text={message} />
    </form>
  )
}

/** Up to three members of an owned community to offer it to; none means delete it. */
function HandOverPicker({
  communityId,
  selfId,
  picks,
  onChange,
}: {
  communityId: string
  selfId: string
  picks: string[]
  onChange: (picks: string[]) => void
}) {
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    listMembers(communityId)
      .then((list) => setMembers(list.filter((m) => m.user_id !== selfId)))
      .catch(() => setMembers([]))
  }, [communityId, selfId])

  if (members.length === 0)
    return <span className="muted">No other members: it will be deleted.</span>

  return (
    <span className="hand-over-picks">
      {picks.map((value, i) => (
        <select
          key={i}
          aria-label={`Choice ${i + 1} for this community`}
          value={value}
          onChange={(e) => onChange(picks.map((v, j) => (j === i ? e.target.value : v)))}
        >
          <option value="">{i === 0 ? 'Delete it' : '—'}</option>
          {choosable(members, picks, i).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.display_name}
            </option>
          ))}
        </select>
      ))}
    </span>
  )
}
