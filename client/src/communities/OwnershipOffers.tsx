// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { listOffers, type OwnershipOffer } from '../api/communities'
import { Link } from '../components/Link'

/** Home: communities someone offered the user to own (ADR 0012); answered on the community. */
export function OwnershipOffers() {
  const [offers, setOffers] = useState<OwnershipOffer[]>([])

  useEffect(() => {
    listOffers()
      .then(setOffers)
      .catch(() => setOffers([]))
  }, [])

  return (
    <>
      {offers.map((o) => (
        <p key={o.id} className="banner" role="status">
          You are offered ownership of <Link to={`/c/${o.community.id}`}>{o.community.name}</Link>.
          Open it to answer.
        </p>
      ))}
    </>
  )
}
