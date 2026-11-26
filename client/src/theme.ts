// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Dark or light (ADR 0016): follows the system by default; the choice is kept
 * on this device. Applied as data-theme on <html>, which the tokens in
 * index.css read.
 */
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'dark' | 'light'

const KEY = 'nosilence.theme'
const listeners = new Set<() => void>()

function read(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'dark' || value === 'light' ? value : 'system'
  } catch {
    return 'system'
  }
}

let choice: ThemeChoice = read()

const systemQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : undefined

export function appliedTheme(value: ThemeChoice = choice): 'dark' | 'light' {
  if (value === 'system') return systemQuery()?.matches === false ? 'light' : 'dark'
  return value
}

function apply() {
  document.documentElement.dataset.theme = appliedTheme()
}

export function setThemeChoice(value: ThemeChoice) {
  choice = value
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // Not stored: still applies until the app restarts.
  }
  apply()
  listeners.forEach((l) => l())
}

/** Call once at start: applies the theme and follows system changes. */
export function startTheme() {
  apply()
  systemQuery()?.addEventListener?.('change', () => {
    if (choice === 'system') apply()
  })
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useThemeChoice = () => useSyncExternalStore(subscribe, () => choice)
