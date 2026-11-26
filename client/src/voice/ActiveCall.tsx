// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useContext, useEffect, useRef } from 'react'
import { sharing } from '../gateway/sharedConnections'
import type { CommunityConnection } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { endCall, useCall, type Call } from './call'

// LiveKit is large; load it only when the user joins a channel.
const VoiceRoom = lazy(() => import('./VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

/**
 * The ongoing call. It belongs to the app, not to a page, so moving around
 * never drops it. It shows nothing itself: the voice panel at the bottom left
 * shows its state (ADR 0016).
 */
export function ActiveCall() {
  const call = useCall()
  if (!call) return null
  return <CallHolder key={`${call.communityId}/${call.channel.id}`} call={call} />
}

function CallHolder({ call }: { call: Call }) {
  const connect = sharing(useContext(GatewayContext))
  const connection = useRef<CommunityConnection>(undefined)

  // The call's own hold on the community's live connection: others see the
  // user in the voice channel even when the community is not on screen.
  useEffect(() => {
    const conn = connect(call.communityId, {
      presence: () => {},
      event: () => {},
      joined: () => {},
      // Removed from the community, or it was deleted.
      removed: endCall,
    })
    connection.current = conn
    return () => {
      connection.current = undefined
      conn.close()
    }
  }, [connect, call.communityId])

  return (
    <div hidden>
      <Suspense fallback={null}>
        <VoiceRoom
          join={call.join}
          channelId={call.channel.id}
          joinStartedAt={call.startedAt}
          onConnected={() => connection.current?.setVoiceChannel(call.channel.id)}
          onLeave={endCall}
        />
      </Suspense>
    </div>
  )
}
