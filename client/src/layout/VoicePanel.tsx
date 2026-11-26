// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Icon } from '../ui/Icon'
import { endCall, useCall } from '../voice/call'
import { CALL_ENDED, connectionQuality, useCallState } from '../voice/callState'
import { formatKeys, useVoiceSettings } from '../voice/settings'

/** A click keeps the bubble open this long (touch screens have no hover). */
const KEEP_OPEN_MS = 4000

/**
 * Above the user panel while in a call (ADR 0016): connected or not, where,
 * and Leave. Hovering, focusing or clicking "Voice connected" shows a short
 * bubble about the connection and the verification code.
 */
export function VoicePanel() {
  const call = useCall()
  const state = useCallState()
  const settings = useVoiceSettings()
  const [bubble, setBubble] = useState<'hover' | 'pinned' | null>(null)
  const [info, setInfo] = useState<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (bubble !== 'pinned') return
    const timer = window.setTimeout(() => setBubble(null), KEEP_OPEN_MS)
    return () => window.clearTimeout(timer)
  }, [bubble])

  if (!call) return null
  const status = state.status
  const secured = status?.state === 'secured'
  const ended = status?.state === 'ended'
  const label = ended ? 'Call ended' : secured ? 'Voice connected' : 'Connecting…'

  return (
    <div className="voice-panel" role="region" aria-label="Voice call">
      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          ref={setInfo}
          type="button"
          className="info"
          aria-label={`${label}: ${call.channel.name} / ${call.communityName}`}
          aria-describedby={bubble ? 'call-bubble' : undefined}
          onMouseEnter={() => setBubble((b) => b ?? 'hover')}
          onMouseLeave={() => setBubble((b) => (b === 'hover' ? null : b))}
          onFocus={() => setBubble((b) => b ?? 'hover')}
          onBlur={() => setBubble((b) => (b === 'hover' ? null : b))}
          onClick={() => setBubble('pinned')}
        >
          <span className={ended ? 'state failed' : secured ? 'state' : 'state pending'}>
            {secured && <Icon name="lock" />}
            {label}
          </span>
          <span className="where">
            {call.channel.name} / {call.communityName}
          </span>
        </button>
        {/* Screen readers hear the state change. */}
        <span className="visually-hidden" role="status">
          {label}
        </span>
        {ended && status && <p className="problem">{CALL_ENDED[status.reason]}</p>}
        {state.micFailed && (
          <p className="problem">The microphone could not be opened. Check the permission.</p>
        )}
        {!ended && settings.mode === 'push' && (
          <span className={state.talking ? 'ptt-state talking' : 'ptt-state'}>
            {state.talking ? 'Talking' : `Hold ${formatKeys(settings.pushKeys)} to talk`}
          </span>
        )}
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label="Leave call"
        title="Leave call"
        onClick={endCall}
      >
        <Icon name="leave" />
      </button>
      {bubble && info && !ended && <CallBubble anchor={info} />}
    </div>
  )
}

function CallBubble({ anchor }: { anchor: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null)
  const { status, rttMs, lossRate } = useCallState()
  const quality = connectionQuality(rttMs, lossRate)

  // Inside the channel column, its arrow pointing at "Voice connected".
  useLayoutEffect(() => {
    const el = ref.current
    const column = anchor.closest('.sidebar')?.getBoundingClientRect()
    if (!el || !column) return
    const r = anchor.getBoundingClientRect()
    el.style.left = `${column.left + 8}px`
    el.style.width = `${column.width - 16}px`
    el.style.setProperty('--arrow', `${r.left - column.left + 12}px`)
    el.style.top = `${r.top - el.offsetHeight - 10}px`
  })

  const bars = quality === 'poor' ? 1 : quality === 'fair' ? 2 : 3
  return (
    <div ref={ref} id="call-bubble" className="bubble" role="tooltip">
      <div className={`quality ${quality ?? 'good'}`}>
        <span className="bars" aria-hidden="true">
          {[6, 10, 14].map((h, i) => (
            <i key={h} style={{ height: h }} className={i < bars ? undefined : 'off'} />
          ))}
        </span>
        {quality === undefined
          ? 'Measuring the connection…'
          : quality === 'good'
            ? 'Good connection'
            : quality === 'fair'
              ? 'Fair connection'
              : 'Poor connection'}
      </div>
      <dl>
        <dt>Encryption</dt>
        <dd>{status?.state === 'secured' ? 'End to end' : 'Setting up…'}</dd>
        <dt>Round trip</dt>
        <dd>{rttMs === undefined ? '–' : `${Math.round(rttMs)} ms`}</dd>
        <dt>Packets lost</dt>
        <dd>{lossRate === undefined ? '–' : `${(lossRate * 100).toFixed(1)} %`}</dd>
        {status?.state === 'secured' && (
          <>
            <dt>Holding the key</dt>
            <dd>{status.members.length}</dd>
          </>
        )}
      </dl>
      {status?.state === 'secured' && (
        <div className="verify">
          Verification code: the same for everyone in the call, or someone else is listening.
          <code className="verification-code">{status.code}</code>
        </div>
      )}
    </div>
  )
}
