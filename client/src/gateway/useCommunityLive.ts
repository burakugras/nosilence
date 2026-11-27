// SPDX-License-Identifier: AGPL-3.0-only
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { connectCommunity } from './phoenixGateway'
import { sharing } from './sharedConnections'
import type { CommunityConnection, ConnectCommunity, LiveEvent, OnlineMember } from './types'

/** Tests provide a fake here instead of a real WebSocket. */
export const GatewayContext = createContext<ConnectCommunity>(connectCommunity)

type Handler = (event: LiveEvent) => void

export type CommunityLive = {
  online: OnlineMember[]
  /** The first presence list has arrived (until then everyone looks offline). */
  synced: boolean
  /** Increases on every (re)join; components reload what they may have missed. */
  generation: number
  setVoiceChannel: (channelId: string | null) => void
  subscribe: (handler: Handler) => () => void
}

export function useCommunityLive(communityId: string, onRemoved: () => void): CommunityLive {
  // Shared with an ongoing call in the same community (see sharing()).
  const connect = sharing(useContext(GatewayContext))
  const [online, setOnline] = useState<OnlineMember[]>([])
  const [synced, setSynced] = useState(false)
  const [generation, setGeneration] = useState(0)
  const connection = useRef<CommunityConnection>(undefined)
  const handlers = useRef(new Set<Handler>())
  const removed = useRef(onRemoved)

  useEffect(() => {
    removed.current = onRemoved
  }, [onRemoved])

  useEffect(() => {
    const conn = connect(communityId, {
      presence: (members) => {
        setOnline(members)
        setSynced(true)
      },
      event: (event) => handlers.current.forEach((h) => h(event)),
      joined: () => setGeneration((g) => g + 1),
      removed: () => removed.current(),
    })
    connection.current = conn
    return () => {
      conn.close()
      connection.current = undefined
    }
  }, [communityId, connect])

  const setVoiceChannel = useCallback((id: string | null) => {
    connection.current?.setVoiceChannel(id)
  }, [])

  const subscribe = useCallback((handler: Handler) => {
    handlers.current.add(handler)
    return () => {
      handlers.current.delete(handler)
    }
  }, [])

  return { online, synced, generation, setVoiceChannel, subscribe }
}
