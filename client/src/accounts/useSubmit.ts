// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from 'react'
import { ApiError } from '../api/http'
import { formatWait, useCountdown, withoutWait } from '../components/useCountdown'
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
  // Rate limited: a live countdown, and no new attempt until it ends.
  const wait = useCountdown()

  async function run(localErrors: Errors, action: () => Promise<void>) {
    setErrors(localErrors)
    setMessage(undefined)
    setStatus(undefined)
    if (Object.keys(localErrors).length > 0 || wait.secondsLeft > 0) return
    setBusy(true)
    try {
      await action()
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.retryAfter) wait.start(error.retryAfter)
        setMessage(error.retryAfter ? withoutWait(error.message) : error.message)
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

  const waiting = wait.secondsLeft > 0
  // While rate limited the message counts down; when the wait is over it goes away.
  const shown = waiting
    ? message && `${message} Try again in ${formatWait(wait.secondsLeft)}.`
    : status === 429
      ? undefined
      : message

  // Busy while waiting too, so forms keep their submit button disabled.
  return { busy: busy || waiting, errors, message: shown, status, run }
}
