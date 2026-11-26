// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  getCommunity,
  listMembers,
  type Channel,
  type CommunitySummary,
  type Member,
} from '../api/communities'
import { useCommunityLive } from '../gateway/useCommunityLive'
import { rememberAvatars } from '../ui/avatars'
import { CommunityContext, type CommunityView } from './communityContext'
import { setCommunityUnread, setOpenChannel } from './communityList'

type Loaded = { community: CommunitySummary; channels: Channel[] }

/**
 * Loads one community and keeps it live for its three columns. `null` while it
 * loads (`loading`) or when it does not exist or the user was removed
 * (`notFound`).
 */
export function CommunityProvider({
  communityId,
  channelId,
  currentUserId,
  loading,
  notFound,
  children,
}: {
  communityId: string
  /** The text channel in the address, if any (else the first). */
  channelId?: string
  currentUserId: string
  loading: ReactNode
  notFound: ReactNode
  children: ReactNode
}) {
  const [data, setData] = useState<Loaded | null>()
  const [members, setMembers] = useState<Member[]>([])
  const [membersKey, setMembersKey] = useState(0)
  const [ownershipKey, setOwnershipKey] = useState(0)
  // Unread messages per text channel (ADR 0010): from the server on load, then
  // counted live for the other channels; the open channel reports its own.
  const [unread, setUnread] = useState<Record<string, number>>({})

  const reload = useCallback(() => {
    getCommunity(communityId)
      .then((loaded) => {
        setData(loaded)
        setUnread(
          Object.fromEntries(
            loaded.channels.flatMap((c) => (c.kind === 'text' ? [[c.id, c.unread ?? 0]] : [])),
          ),
        )
      })
      .catch(() => setData(null))
  }, [communityId])
  useEffect(reload, [reload])

  useEffect(() => {
    listMembers(communityId)
      .then(setMembers)
      .catch(() => setMembers([]))
  }, [communityId, membersKey])

  // Removed from the community, or it was deleted.
  const onRemoved = useCallback(() => setData(null), [])
  const live = useCommunityLive(communityId, onRemoved)
  const { subscribe } = live

  const textChannels = data?.channels.filter((c) => c.kind === 'text') ?? []
  const openTextId = textChannels.some((c) => c.id === channelId) ? channelId : textChannels[0]?.id

  useEffect(() => {
    setOpenChannel(openTextId)
    return () => setOpenChannel(undefined)
  }, [openTextId])

  useEffect(
    () =>
      subscribe((event) => {
        if (
          event.type === 'message_created' &&
          event.message.channel_id !== openTextId &&
          event.message.author?.id !== currentUserId
        )
          setUnread((u) => ({
            ...u,
            [event.message.channel_id]: (u[event.message.channel_id] ?? 0) + 1,
          }))
        if (event.type === 'member_joined' || event.type === 'member_removed')
          setMembersKey((k) => k + 1)
        if (event.type === 'member_updated') {
          setMembersKey((k) => k + 1)
          // Our own role changed: reload what we may do here.
          if (event.user_id === currentUserId) reload()
        }
        if (event.type === 'account_deleted') setMembersKey((k) => k + 1)
        if (event.type === 'channels_changed') reload()
        if (event.type === 'ownership_changed') setOwnershipKey((k) => k + 1)
        if (event.type === 'channel_created')
          setData((d) =>
            d && !d.channels.some((c) => c.id === event.channel.id)
              ? { ...d, channels: [...d.channels, event.channel] }
              : d,
          )
      }),
    [subscribe, openTextId, currentUserId, reload],
  )

  // The rail shows this community's total.
  const total = Object.values(unread).reduce((sum, n) => sum + n, 0)
  useEffect(() => {
    if (data) setCommunityUnread(communityId, Math.min(100, total))
  }, [communityId, data, total])

  const reportUnread = useCallback(
    (count: number) => {
      if (openTextId)
        setUnread((u) => (u[openTextId] === count ? u : { ...u, [openTextId]: count }))
    },
    [openTextId],
  )

  // Invisible people in voice are connected but shown offline (ADR 0017).
  const presence = useMemo(() => new Map(live.online.map((m) => [m.id, m])), [live.online])
  const online = useMemo(
    () => new Set(live.online.filter((m) => m.status !== 'offline').map((m) => m.id)),
    [live.online],
  )
  const people = useMemo(
    () =>
      members.map((m) => ({ id: m.user_id, username: m.username, display_name: m.display_name })),
    [members],
  )
  useEffect(
    () => rememberAvatars(members.map((m) => ({ id: m.user_id, avatar: m.avatar }))),
    [members],
  )

  const view = useMemo<CommunityView | null>(() => {
    if (!data) return null
    const myRole = data.community.role
    return {
      community: data.community,
      channels: data.channels,
      myRole,
      isOwner: myRole === 'owner',
      canModerate: myRole !== 'member',
      currentUserId,
      live,
      online,
      presence,
      members,
      people,
      unread,
      openTextId,
      reportUnread,
      reload,
      ownershipKey,
    }
  }, [
    data,
    currentUserId,
    live,
    online,
    presence,
    members,
    people,
    unread,
    openTextId,
    reportUnread,
    reload,
    ownershipKey,
  ])

  if (data === undefined) return <>{loading}</>
  if (!view) return <>{notFound}</>
  return <CommunityContext.Provider value={view}>{children}</CommunityContext.Provider>
}
