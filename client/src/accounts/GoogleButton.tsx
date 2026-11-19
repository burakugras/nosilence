// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { GOOGLE_SIGN_IN_URL, providers } from '../api/accounts'

/** "Continue with Google", shown only when the server has Google configured. */
export function GoogleButton({ check = providers }: { check?: typeof providers }) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    let active = true
    check()
      .then((p) => active && setEnabled(p.google))
      .catch(() => active && setEnabled(false))
    return () => {
      active = false
    }
  }, [check])

  if (!enabled) return null
  return (
    <p>
      <a className="button-link" href={GOOGLE_SIGN_IN_URL}>
        Continue with Google
      </a>
    </p>
  )
}
