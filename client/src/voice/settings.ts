// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Voice settings of this device (ADR 0013): microphone, speaker, how the user
 * talks (voice activity or push-to-talk) and the push-to-talk keys. Kept in
 * localStorage: they describe this machine's hardware, not the account.
 */
import { useSyncExternalStore } from 'react'

export type TalkMode = 'voice' | 'push'

export type VoiceSettings = {
  /** Empty: the system default device. */
  microphoneId: string
  speakerId: string
  mode: TalkMode
  /** Key ids (see `keyId`), all held together to talk. */
  pushKeys: string[]
}

export const DEFAULT_SETTINGS: VoiceSettings = {
  microphoneId: '',
  speakerId: '',
  mode: 'voice',
  pushKeys: ['Ctrl', 'Shift'],
}

export const MAX_PUSH_KEYS = 3

/** Microphone processing in calls and in the settings test (same sound). */
export const CAPTURE = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

const STORAGE_KEY = 'nosilence.voice-settings'

const MODIFIERS: Record<string, string> = { Control: 'Ctrl', Shift: 'Shift', Alt: 'Alt' }
const CODE = /^(Key[A-Z]|Digit[0-9]|F([1-9]|1[0-2])|Space)$/

/**
 * The id of a key we support for push-to-talk, or undefined. Modifiers count
 * on either side (left or right Ctrl). The desktop app maps the same ids to
 * Windows virtual keys (desktop/src/ptt.rs).
 */
export function keyId(event: Pick<KeyboardEvent, 'key' | 'code'>): string | undefined {
  if (MODIFIERS[event.key]) return MODIFIERS[event.key]
  return CODE.test(event.code) ? event.code : undefined
}

/** Mouse side buttons (back and forward), usable while the window is focused. */
export function mouseId(button: number): string | undefined {
  return button === 3 ? 'Mouse4' : button === 4 ? 'Mouse5' : undefined
}

const ORDER = ['Ctrl', 'Shift', 'Alt']

/** Modifiers first, in a fixed order, so "Shift + Ctrl" and "Ctrl + Shift" are the same. */
export function normalizeKeys(keys: string[]): string[] {
  const unique = [...new Set(keys)]
  const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length)
  return unique.sort((a, b) => rank(a) - rank(b)).slice(0, MAX_PUSH_KEYS)
}

/** "Ctrl + Shift", "Ctrl + V", "F8", "Mouse 4". */
export function formatKeys(keys: string[]): string {
  const label = (k: string) =>
    k.startsWith('Key')
      ? k.slice(3)
      : k.startsWith('Digit')
        ? k.slice(5)
        : k.startsWith('Mouse')
          ? `Mouse ${k.slice(5)}`
          : k
  return keys.map(label).join(' + ')
}

const isKey = (k: unknown): k is string =>
  typeof k === 'string' && (ORDER.includes(k) || CODE.test(k) || k === 'Mouse4' || k === 'Mouse5')

function read(): VoiceSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<VoiceSettings>
    if (!raw || typeof raw !== 'object') return DEFAULT_SETTINGS
    const keys = Array.isArray(raw.pushKeys) ? normalizeKeys(raw.pushKeys.filter(isKey)) : []
    return {
      microphoneId: typeof raw.microphoneId === 'string' ? raw.microphoneId : '',
      speakerId: typeof raw.speakerId === 'string' ? raw.speakerId : '',
      mode: raw.mode === 'push' ? 'push' : 'voice',
      pushKeys: keys.length > 0 ? keys : DEFAULT_SETTINGS.pushKeys,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

let current: VoiceSettings | undefined
const listeners = new Set<() => void>()

export function getVoiceSettings(): VoiceSettings {
  current ??= read()
  return current
}

export function updateVoiceSettings(change: Partial<VoiceSettings>) {
  current = { ...getVoiceSettings(), ...change }
  if (change.pushKeys) current.pushKeys = normalizeKeys(change.pushKeys)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Private windows may refuse storage; the settings still apply until reload.
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The settings, re-rendering when they change (also in an ongoing call). */
export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(subscribe, getVoiceSettings)
}

/** Tests only: forget the cached settings. */
export function resetVoiceSettingsForTests() {
  current = undefined
}
