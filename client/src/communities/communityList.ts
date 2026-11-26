// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The user's communities for the rail (ADR 0016), with unread counts. New
 * messages arrive on the user's own topic (`notify`); the channel on screen
 * does not count.
 */
import { useSyncExternalStore } from 'react'
import { listCommunities, type CommunitySummary } from '../api/communities'
import type { MessageNotice } from '../gateway/types'
import { onUserEvent } from '../gateway/userLive'

let list: CommunitySummary[] | undefined
let openChannelId: string | undefined
const listeners = new Set<() => void>()

function set(next: CommunitySummary[] | undefined) {
  list = next
  listeners.forEach((l) => l())
}

export async function refreshCommunities(load = listCommunities) {
  try {
    set(await load())
  } catch {
    // Offline for a moment: keep what we have.
  }
}

/** The text channel on screen; its messages do not add to the badge. */
export function setOpenChannel(channelId: string | undefined) {
  openChannelId = channelId
}

/** Unread count for one community, as the community view knows it best. */
export function setCommunityUnread(communityId: string, unread: number) {
  if (!list) return
  const current = list.find((c) => c.id === communityId)
  if (current && current.unread !== unread)
    set(list.map((c) => (c.id === communityId ? { ...c, unread } : c)))
}

/** While signed in: load, then count new messages. Returns a stop function. */
export function followCommunities(): () => void {
  void refreshCommunities()
  const stop = onUserEvent((event, payload) => {
    if (event === 'joined') return void refreshCommunities()
    if (event !== 'notify' || !list) return
    const notice = payload as MessageNotice
    if (notice.channel_id === openChannelId) return
    if (!list.some((c) => c.id === notice.community_id)) return void refreshCommunities()
    set(
      list.map((c) =>
        c.id === notice.community_id ? { ...c, unread: Math.min(100, (c.unread ?? 0) + 1) } : c,
      ),
    )
  })
  return () => {
    stop()
    set(undefined)
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useCommunityList = () => useSyncExternalStore(subscribe, () => list)

/** Two letters for the rail: "Oyun Gecesi" -> "OG", "Ekip" -> "EK". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1
      ? [...words[0]][0] + [...words[1]][0]
      : [...(words[0] ?? '?')].slice(0, 2).join('')
  return letters.toLocaleUpperCase()
}
