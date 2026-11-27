// SPDX-License-Identifier: AGPL-3.0-only
/**
 * What the ongoing call reports to the rest of the app (ADR 0016): encryption
 * status, connection quality, who is speaking, the microphone being sent. The
 * call itself (VoiceRoom) has no visible UI; the voice panel, its bubble, the
 * channel list and the settings read this.
 *
 * Mute and deafen are the user's choices and outlive a call, like a headset's
 * switches.
 */
import { useSyncExternalStore } from 'react'
import type { E2eeStatus } from '../e2ee/session'

export type CallStatus = E2eeStatus | { state: 'ended'; reason: 'unsupported' }

export type CallState = {
  status: CallStatus | null
  /** Round trip of our audio and the share of incoming packets lost, recently. */
  rttMs?: number
  lossRate?: number
  /** Identities (user ids) speaking right now. */
  speaking: string[]
  /** The microphone being sent, for the level meter in the settings. */
  micTrack?: MediaStreamTrack
  micFailed: boolean
  /** Push-to-talk keys held. */
  talking: boolean
}

export type Controls = { muted: boolean; deafened: boolean }

const IDLE: CallState = { status: null, speaking: [], micFailed: false, talking: false }

let state: CallState = IDLE
let controls: Controls = { muted: false, deafened: false }
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function reportCall(change: Partial<CallState>) {
  state = { ...state, ...change }
  notify()
}

/** The call ended: forget what it reported (the controls stay). */
export function resetCallState() {
  state = IDLE
  notify()
}

export function toggleMute() {
  // Unmuting also undeafens: you cannot talk without hearing.
  controls = controls.muted ? { muted: false, deafened: false } : { ...controls, muted: true }
  notify()
}

// Deafening also mutes; undeafening brings back the mute chosen before.
let mutedBeforeDeafen = false

export function toggleDeafen() {
  if (controls.deafened) {
    controls = { muted: mutedBeforeDeafen, deafened: false }
  } else {
    mutedBeforeDeafen = controls.muted
    controls = { muted: true, deafened: true }
  }
  notify()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Calls `listener` when the mute or deafen switch changes (interaction sounds). */
export function onControlsChange(listener: (controls: Controls) => void) {
  let last = controls
  const l = () => {
    if (controls !== last) {
      last = controls
      listener(controls)
    }
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Calls `listener` once the microphone is open (or failed) in a call (interaction sounds). */
export function onMicReady(listener: () => void) {
  let ready = !!state.micTrack || state.micFailed
  const l = () => {
    const now = !!state.micTrack || state.micFailed
    if (now && !ready) listener()
    ready = now
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Calls `listener` when the call's status changes (interaction sounds). */
export function onCallStatus(listener: (status: CallStatus | null) => void) {
  let last = state.status
  const l = () => {
    if (state.status !== last) {
      last = state.status
      listener(state.status)
    }
  }
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

export const useCallState = () => useSyncExternalStore(subscribe, () => state)
export const useControls = () => useSyncExternalStore(subscribe, () => controls)
export const getControls = () => controls

/** Tests only. */
export function resetControlsForTests() {
  controls = { muted: false, deafened: false }
  mutedBeforeDeafen = false
  state = IDLE
}

/** "Good", "Fair" or "Poor" from the numbers WebRTC reports. */
export function connectionQuality(
  rttMs?: number,
  lossRate?: number,
): 'good' | 'fair' | 'poor' | undefined {
  if (rttMs === undefined && lossRate === undefined) return undefined
  if ((rttMs ?? 0) > 400 || (lossRate ?? 0) > 0.1) return 'poor'
  if ((rttMs ?? 0) > 150 || (lossRate ?? 0) > 0.03) return 'fair'
  return 'good'
}

/** Why a call ended, for the voice panel. */
export const CALL_ENDED: Record<string, string> = {
  unsupported:
    'This browser cannot encrypt calls end to end. Try a current Chrome, Edge or Firefox.',
  failed: 'The call could not be encrypted, so you were disconnected.',
  removed: 'You no longer have access to this channel.',
  superseded: 'You joined this channel from another tab or device.',
}
