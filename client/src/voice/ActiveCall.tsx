// SPDX-License-Identifier: AGPL-3.0-only
import { lazy, Suspense, useContext, useEffect, useRef } from 'react'
import { Link } from '../components/Link'
import { sharing } from '../gateway/sharedConnections'
import type { CommunityConnection } from '../gateway/types'
import { GatewayContext } from '../gateway/useCommunityLive'
import { useLocation } from '../router'
import { endCall, useCall, type Call } from './call'

const VoiceRoom = lazy(() => import('./VoiceRoom').then((m) => ({ default: m.VoiceRoom })))

/**
 * The ongoing call, shown above every page while the user is signed in, so
 * moving around the app never drops it.
 */
export function ActiveCall() {
  const call = useCall()
  if (!call) return null
  return <CallPanel key={`${call.communityId}/${call.channel.id}`} call={call} />
}

function CallPanel({ call }: { call: Call }) {
  const connect = sharing(useContext(GatewayContext))
  const connection = useRef<CommunityConnection>(undefined)
  const { path } = useLocation()

  // The call's own hold on the community's live connection: others see the
  // user in the voice channel even when the community page is closed.
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
    <section className="active-call" aria-label="Ongoing call">
      {path !== `/c/${call.communityId}` && (
        <p className="muted">
          <Link to={`/c/${call.communityId}`}>Open {call.communityName}</Link>
        </p>
      )}
      <Suspense fallback={<p>Connecting…</p>}>
        <VoiceRoom
          join={call.join}
          channelId={call.channel.id}
          joinStartedAt={call.startedAt}
          title={`${call.communityName} · ${call.channel.name}`}
          onConnected={() => connection.current?.setVoiceChannel(call.channel.id)}
          onLeave={endCall}
        />
      </Suspense>
    </section>
  )
}
