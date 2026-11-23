// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  acceptOffer,
  cancelTransfer,
  declineOffer,
  getTransfer,
  listOffers,
  offerOwnership,
  type Member,
  type OwnershipOffer,
  type Role,
  type Transfer,
  type TransferState,
} from '../api/communities'
import { ApiError } from '../api/http'
import { FormMessage } from '../components/Field'
import { choosable } from './roles'

const when = (iso: string) => new Date(iso).toLocaleString()

type Props = {
  community: { id: string; name: string }
  myRole: Role
  currentUserId: string
  members: Member[]
  /** Changes when the server says the transfer changed. */
  refreshKey: number
  /** The current user became owner. */
  onBecameOwner: () => void
}

/**
 * Handing a community over (ADR 0012): the owner's offer to up to three members,
 * the candidate's accept/decline, and what everyone else should know.
 */
export function OwnershipSection(props: Props) {
  const { community, myRole, currentUserId, members, refreshKey, onBecameOwner } = props
  const [state, setState] = useState<TransferState>()
  const transfer = state?.transfer
  const [offer, setOffer] = useState<OwnershipOffer>()
  const [message, setMessage] = useState<string>()

  const load = useCallback(() => {
    getTransfer(community.id)
      .then(setState)
      .catch(() => setState(undefined))
    listOffers()
      .then((offers) => setOffer(offers.find((o) => o.community.id === community.id)))
      .catch(() => setOffer(undefined))
  }, [community.id])

  useEffect(load, [load, refreshKey])

  const name = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? 'a member'

  async function answer(accept: boolean) {
    if (!offer) return
    setMessage(undefined)
    try {
      await (accept ? acceptOffer(offer.id) : declineOffer(offer.id))
      if (accept) onBecameOwner()
      load()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not answer the offer.')
    }
  }

  return (
    <>
      {transfer?.status === 'deleting' && transfer.delete_at && (
        <p className="banner danger-banner" role="alert">
          Nobody took over this community. It will be deleted on {when(transfer.delete_at)}.
        </p>
      )}
      {transfer?.status === 'offered' && transfer.kind === 'account_deleted' && (
        <p className="banner" role="status">
          The owner deleted their account and offered this community to members they chose. If none
          of them accepts, it will be deleted.
        </p>
      )}
      {offer && (
        <div className="banner" role="alert">
          <p>
            You are offered ownership of <strong>{offer.community.name}</strong>. Please answer by{' '}
            {when(offer.deadline)}; after that the next person is asked.
          </p>
          <button type="button" onClick={() => void answer(true)}>
            Accept ownership
          </button>{' '}
          <button type="button" className="link-button" onClick={() => void answer(false)}>
            Decline
          </button>
        </div>
      )}
      {myRole === 'owner' && state && (
        <HandOver
          community={community}
          availableAt={state.handover_available_at}
          members={members.filter((m) => m.user_id !== currentUserId)}
          transfer={
            transfer?.kind === 'voluntary' && transfer.status === 'offered' ? transfer : null
          }
          name={name}
          onChanged={load}
        />
      )}
      <FormMessage text={message} />
    </>
  )
}

function HandOver({
  community,
  availableAt,
  members,
  transfer,
  name,
  onChanged,
}: {
  community: { id: string; name: string }
  /** The end of the 7-day wait after taking over (null: can hand over now). */
  availableAt: string | null
  members: Member[]
  transfer: Transfer | null
  name: (id: string) => string
  onChanged: () => void
}) {
  const [picks, setPicks] = useState(['', '', ''])
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState<string>()

  async function submit(event: FormEvent) {
    event.preventDefault()
    const candidates = picks.filter(Boolean)
    if (candidates.length === 0) return setMessage('Choose at least one member.')
    if (new Set(candidates).size !== candidates.length)
      return setMessage('Choose different members.')
    if (confirm.trim() !== community.name) return setMessage('Type the community name exactly.')
    setMessage(undefined)
    try {
      await offerOwnership(community.id, candidates)
      setPicks(['', '', ''])
      setConfirm('')
      onChanged()
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'Could not make the offer.')
    }
  }

  if (transfer) {
    const asked = transfer.candidates[transfer.current]
    return (
      <section aria-label="Hand over">
        <h3>Hand over community</h3>
        <p>
          Offered to <strong>{name(asked)}</strong> ({transfer.current + 1} of{' '}
          {transfer.candidates.length}), who can answer until {when(transfer.deadline)}. If nobody
          accepts, you stay the owner.
        </p>
        <button
          type="button"
          className="link-button"
          onClick={() => void cancelTransfer(community.id).then(onChanged)}
        >
          Withdraw the offer
        </button>
      </section>
    )
  }

  if (availableAt) {
    return (
      <section aria-label="Hand over">
        <h3>Hand over community</h3>
        <p className="muted">
          You took over this community recently. You can hand it over again after{' '}
          {when(availableAt)}.
        </p>
      </section>
    )
  }

  return (
    <form className="stack-form" onSubmit={submit} noValidate aria-label="Hand over community">
      <h3>Hand over community</h3>
      <p className="muted">
        Choose up to three members, in order. The first has 72 hours to accept; then the next is
        asked. You become a moderator when someone accepts; if nobody does, you stay the owner.
      </p>
      {picks.map((value, i) => (
        <label key={i} className="stack-label">
          {i === 0
            ? 'First choice'
            : i === 1
              ? 'Second choice (optional)'
              : 'Third choice (optional)'}
          <select
            value={value}
            onChange={(e) => setPicks((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
          >
            <option value="">—</option>
            {choosable(members, picks, i).map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label className="stack-label">
        Type the community name to confirm
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <button type="submit">Offer ownership</button>
      <FormMessage text={message} />
    </form>
  )
}
