// SPDX-License-Identifier: AGPL-3.0-only
/**
 * One connection to the signed-in user's own topic, shared by every view that
 * needs it (friends, conversations, the unread badge, desktop notifications).
 */
import { useEffect, useRef } from 'react'
import { openUserTopic, type UserEventName } from './phoenixGateway'

type Handler = (event: UserEventName, payload: unknown) => void

const handlers = new Set<Handler>()
let stop: (() => void) | undefined

/** Opens the topic while signed in. Returns a function that closes it. */
export function startUserLive(userId: string, open = openUserTopic): () => void {
  stop?.()
  const close = open(userId, (event, payload) => handlers.forEach((h) => h(event, payload)))
  stop = close
  return () => {
    close()
    if (stop === close) stop = undefined
  }
}

export function onUserEvent(handler: Handler): () => void {
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
  }
}

/** Calls the latest `handler` for every event on the user's topic. */
export function useUserEvents(handler: Handler) {
  const latest = useRef(handler)
  useEffect(() => {
    latest.current = handler
  })
  useEffect(() => onUserEvent((event, payload) => latest.current(event, payload)), [])
}

/** Tests: deliver an event as if it came from the server. */
export function emitUserEventForTests(event: UserEventName, payload: unknown) {
  handlers.forEach((h) => h(event, payload))
}
