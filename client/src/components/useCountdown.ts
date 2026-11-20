// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from 'react'

/**
 * A live countdown in whole seconds, e.g. after the server says "try again in
 * 30 seconds". `start` sets the deadline once; the value then ticks down by
 * itself, so pressing a button again does not reset or re-fetch it.
 */
export function useCountdown() {
  const [deadline, setDeadline] = useState<number>()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === undefined) return
    const timer = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= deadline) {
        setDeadline(undefined)
        window.clearInterval(timer)
      }
    }, 250)
    return () => window.clearInterval(timer)
  }, [deadline])

  const start = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setDeadline(t + seconds * 1000)
  }, [])

  const secondsLeft = deadline === undefined ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000))
  return { secondsLeft, start }
}

/** "45 seconds", "1 second", "2:05". */
export function formatWait(seconds: number) {
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60)
    const s = String(seconds % 60).padStart(2, '0')
    return `${m}:${s}`
  }
  return seconds === 1 ? '1 second' : `${seconds} seconds`
}

/** The server's message without its own "Try again in …" (we show a live one). */
export const withoutWait = (message: string) => message.replace(/\s*Try again in .*$/, '')
