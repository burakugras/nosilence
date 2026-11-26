// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Profile pictures (ADR 0017). The server sends a version number next to
 * people; the picture itself is loaded once per version with the user's
 * credentials (the desktop app cannot put its token on an <img> address) and
 * kept as an object URL for this session.
 *
 * The newest version heard for a person (presence, the user's own changes) wins
 * over the one a message or a list carried, so a new picture shows everywhere.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { fetchBlob } from '../api/http'

type Entry = { url?: string; loading: boolean }

const pictures = new Map<string, Entry>()
const latest = new Map<string, number | null>()
const listeners = new Set<() => void>()
let tick = 0

function changed() {
  tick += 1
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Records the newest picture version heard for people (null: they removed it). */
export function rememberAvatars(people: { id: string; avatar?: number | null }[]) {
  let any = false
  for (const { id, avatar } of people) {
    if (avatar === undefined || latest.get(id) === avatar) continue
    latest.set(id, avatar)
    any = true
  }
  if (any) changed()
}

function load(id: string, version: number) {
  const key = `${id}:${version}`
  if (pictures.has(key)) return
  pictures.set(key, { loading: true })
  void fetchBlob(`/api/users/${id}/avatar?v=${version}`).then((blob) => {
    pictures.set(key, {
      loading: false,
      url: blob && blob.type === 'image/webp' ? URL.createObjectURL(blob) : undefined,
    })
    changed()
  })
}

/**
 * The address of a person's picture to show, or undefined (no picture, not
 * loaded yet, or not allowed): the initial is shown then.
 */
export function useAvatarSrc(id: string, version: number | null | undefined): string | undefined {
  useSyncExternalStore(subscribe, () => tick)
  const current = latest.has(id) ? latest.get(id) : version
  useEffect(() => {
    if (current) load(id, current)
  }, [id, current])
  return current ? pictures.get(`${id}:${current}`)?.url : undefined
}

/** Tests: forget everything. */
export function resetAvatarsForTests() {
  for (const { url } of pictures.values()) if (url) URL.revokeObjectURL(url)
  pictures.clear()
  latest.clear()
  changed()
}
