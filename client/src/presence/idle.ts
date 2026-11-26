// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Idle (ADR 0017): no keyboard, mouse or touch input in this app for ten
 * minutes. Reported to the server on the live connection, never stored.
 */
import { setIdle } from '../gateway/phoenixGateway'

export const IDLE_AFTER_MS = 10 * 60 * 1000
const EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const

/** Starts watching for input. Returns a function that stops it. */
export function startIdleWatch(report: (idle: boolean) => void = setIdle, after = IDLE_AFTER_MS) {
  let timer: number | undefined
  let idle = false
  let last = 0

  const arm = () => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      idle = true
      report(true)
    }, after)
  }

  const onInput = () => {
    if (idle) {
      idle = false
      report(false)
    }
    // Mouse moves come many times a second: re-arm at most once a second.
    const now = Date.now()
    if (now - last < 1000) return
    last = now
    arm()
  }

  arm()
  for (const e of EVENTS) window.addEventListener(e, onInput, { passive: true })
  return () => {
    window.clearTimeout(timer)
    for (const e of EVENTS) window.removeEventListener(e, onInput)
  }
}
