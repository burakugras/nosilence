// SPDX-License-Identifier: AGPL-3.0-only
import type {
  CommunityConnection,
  CommunityListener,
  ConnectCommunity,
  OnlineMember,
} from './types'

type Entry = {
  connection: CommunityConnection
  listeners: Set<CommunityListener>
  presence?: OnlineMember[]
  joined: boolean
  /** The handle that set the user's voice channel (the call). */
  voiceOwner?: CommunityListener
}

const sharers = new WeakMap<ConnectCommunity, ConnectCommunity>()

/**
 * One live connection per community, shared by everyone who needs it: the
 * community page and an ongoing call (which stays when the user opens another
 * page). Phoenix allows a topic only once per socket, so a second join would
 * close the first. The connection closes when the last user closes it.
 */
export function sharing(connect: ConnectCommunity): ConnectCommunity {
  const existing = sharers.get(connect)
  if (existing) return existing
  const entries = new Map<string, Entry>()

  const shared: ConnectCommunity = (communityId, listener) => {
    let entry = entries.get(communityId)
    if (!entry) {
      const fresh: Entry = {
        listeners: new Set(),
        joined: false,
        connection: undefined as unknown as CommunityConnection,
      }
      entries.set(communityId, fresh)
      fresh.connection = connect(communityId, {
        presence: (members) => {
          fresh.presence = members
          fresh.listeners.forEach((l) => l.presence(members))
        },
        event: (event) => fresh.listeners.forEach((l) => l.event(event)),
        joined: () => {
          fresh.joined = true
          fresh.listeners.forEach((l) => l.joined())
        },
        removed: () => fresh.listeners.forEach((l) => l.removed()),
      })
      entry = fresh
    } else {
      // A late user catches up with what the others already know.
      const { presence, joined } = entry
      queueMicrotask(() => {
        if (presence) listener.presence(presence)
        if (joined) listener.joined()
      })
    }
    const current = entry
    current.listeners.add(listener)

    return {
      setVoiceChannel(channelId) {
        current.voiceOwner = channelId ? listener : undefined
        current.connection.setVoiceChannel(channelId)
      },
      close() {
        if (!current.listeners.delete(listener)) return
        if (current.voiceOwner === listener) {
          current.voiceOwner = undefined
          current.connection.setVoiceChannel(null)
        }
        if (current.listeners.size === 0) {
          entries.delete(communityId)
          current.connection.close()
        }
      },
    }
  }
  sharers.set(connect, shared)
  return shared
}
