// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { ApiError } from '../api/http'
import type { Errors } from '../validation'

/**
 * Busy state and error handling shared by the account forms.
 * `run` validates locally first; server field errors are merged into `errors`.
 */
export function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string>()
  // HTTP status of the last failed request, e.g. 403 for an unconfirmed account.
  const [status, setStatus] = useState<number>()

  async function run(localErrors: Errors, action: () => Promise<void>) {
    setErrors(localErrors)
    setMessage(undefined)
    setStatus(undefined)
    if (Object.keys(localErrors).length > 0) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof ApiError) {
        setMessage(error.message)
        setStatus(error.status)
        setErrors(
          Object.fromEntries(
            Object.keys(error.fieldErrors).map((k) => [k, error.field(k) ?? 'Invalid value.']),
          ),
        )
      } else {
        setMessage('Something went wrong.')
      }
    } finally {
      setBusy(false)
    }
  }

  return { busy, errors, message, status, run }
}
