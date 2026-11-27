// SPDX-License-Identifier: AGPL-3.0-only
/**
 * When interaction sounds play (ADR 0020), and the user's choices for them
 * (kept on this device, like the notification settings).
 *
 * - Voice: joining and leaving, others joining and leaving your channel (the
 *   people in the call's encryption group, who can actually hear you), mute
 *   and deafen, the connection dropping and coming back. Push-to-talk makes
 *   no sound.
 * - Messages: direct messages and mentions only, while the app is in front
 *   and that conversation or channel is not on screen (in the background the
 *   system notification speaks), at the levels the user set (ADR 0018), and
 *   never in do not disturb.
 * - Deafened: nothing from others; the user's own actions still sound.
 */
import { useSyncExternalStore } from 'react'
import { getControls, onControlsChange, type Controls } from '../voice/callState'
import { onCallChange, type Call } from '../voice/call'
import { onCallStatus } from '../voice/callState'
import type { E2eeStatus } from '../e2ee/session'
import type { MessageNotice } from '../gateway/types'
import { onUserEvent } from '../gateway/userLive'
import { channelLevel, conversationLevel, notifies } from '../notifications/levels'
import { myStatusChoice } from '../presence/myProfile'
import { isBlocked } from '../social/blockedStore'
import { openChannelId } from '../communities/communityList'
import { synthesize, warmUp, type SoundName } from './engine'

export type SoundSettings = { volume: number; voice: boolean; messages: boolean }

const KEY = 'nosilence.sounds'
const DEFAULTS: SoundSettings = { volume: 0.5, voice: true, messages: true }
const VOICE: SoundName[] = [
  'join',
  'leave',
  'otherJoin',
  'otherLeave',
  'mute',
  'unmute',
  'deafen',
  'undeafen',
  'lost',
  'back',
]
const FROM_OTHERS: SoundName[] = ['otherJoin', 'otherLeave', 'message', 'mention']

let settings: SoundSettings | undefined
const listeners = new Set<() => void>()

export function getSoundSettings(): SoundSettings {
  if (!settings) {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<SoundSettings> | null
      settings = {
        volume:
          typeof raw?.volume === 'number' ? Math.min(1, Math.max(0, raw.volume)) : DEFAULTS.volume,
        voice: raw?.voice !== false,
        messages: raw?.messages !== false,
      }
    } catch {
      settings = DEFAULTS
    }
  }
  return settings
}

export function updateSoundSettings(change: Partial<SoundSettings>) {
  settings = { ...getSoundSettings(), ...change }
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private mode: kept for this session only.
  }
  listeners.forEach((l) => l())
}

export const useSoundSettings = () =>
  useSyncExternalStore((l) => {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, getSoundSettings)

/** Whether `name` may play now, by the user's settings and deafen. */
export function allowed(name: SoundName, s: SoundSettings, controls: Controls) {
  if (s.volume <= 0) return false
  if (!(VOICE.includes(name) ? s.voice : s.messages)) return false
  if (controls.deafened && FROM_OTHERS.includes(name)) return false
  return true
}

let player: (name: SoundName, volume: number) => void = synthesize

export function play(name: SoundName) {
  const s = getSoundSettings()
  if (allowed(name, s, getControls())) player(name, s.volume)
}

/** The sound for a change of the mute and deafen switches, if any. */
export function controlSound(before: Controls, after: Controls): SoundName | undefined {
  if (before.deafened !== after.deafened) return after.deafened ? 'deafen' : 'undeafen'
  if (before.muted !== after.muted) return after.muted ? 'mute' : 'unmute'
  return undefined
}

/**
 * Sounds for a change of the call's encryption status: joining once it is
 * secured, and others joining or leaving the group afterwards.
 */
export function statusSounds(
  before: E2eeStatus | null,
  after: E2eeStatus | null,
  me: string,
): SoundName[] {
  if (after?.state !== 'secured') return []
  if (before?.state !== 'secured') return ['join']
  const was = new Set(before.members)
  const now = new Set(after.members)
  const sounds: SoundName[] = []
  if ([...now].some((id) => id !== me && !was.has(id))) sounds.push('otherJoin')
  if ([...was].some((id) => id !== me && !now.has(id))) sounds.push('otherLeave')
  return sounds
}

const inFront = () => document.hasFocus() && !document.hidden

/**
 * While signed in: plays the sounds as things happen. Returns a stop function.
 */
export function startSounds(userId: string): () => void {
  const stops: (() => void)[] = []

  // The first click or key wakes the audio, before any sound needs it.
  const wake = () => {
    warmUp()
    window.removeEventListener('pointerdown', wake)
    window.removeEventListener('keydown', wake)
  }
  window.addEventListener('pointerdown', wake)
  window.addEventListener('keydown', wake)
  stops.push(() => {
    window.removeEventListener('pointerdown', wake)
    window.removeEventListener('keydown', wake)
  })

  let controls = getControls()
  stops.push(
    onControlsChange((next) => {
      const sound = controlSound(controls, next)
      controls = next
      if (sound) play(sound)
    }),
  )

  let status: E2eeStatus | null = null
  stops.push(
    onCallStatus((next) => {
      const e2ee = next && next.state !== 'ended' ? (next as E2eeStatus) : null
      for (const sound of statusSounds(status, e2ee, userId)) play(sound)
      status = e2ee
    }),
  )

  let call: Call | null = null
  stops.push(
    onCallChange((next) => {
      // The user left (or was taken out of) a call that had connected.
      if (call && !next && status?.state === 'secured') play('leave')
      if (!next) status = null
      call = next
    }),
  )

  stops.push(
    onUserEvent((event, payload) => {
      if (!inFront() || myStatusChoice() === 'dnd') return
      if (event === 'notify') {
        const n = payload as MessageNotice
        if (!n.mentioned || n.channel_id === openChannelId()) return
        if (notifies(channelLevel(n.community_id, n.channel_id), true)) play('mention')
      }
      if (event === 'dm_created') {
        const m = payload as {
          conversation_id: string
          author: { id: string } | null
          mentions?: string[]
        }
        if (!m.author || m.author.id === userId || isBlocked(m.author.id)) return
        if (window.location.pathname === `/messages/${m.conversation_id}`) return
        const mentioned = (m.mentions ?? []).includes(userId)
        if (notifies(conversationLevel(m.conversation_id), mentioned))
          play(mentioned ? 'mention' : 'message')
      }
    }),
  )

  return () => stops.forEach((stop) => stop())
}

/** Tests: record instead of playing. */
export function setPlayerForTests(next: (name: SoundName, volume: number) => void) {
  player = next
}

export function resetSoundSettingsForTests() {
  settings = undefined
  player = synthesize
}
