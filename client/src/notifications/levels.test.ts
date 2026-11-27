// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { desktopInviteLink, inviteToken } from '../communities/inviteLink'
import { reactorsText } from '../communities/reactions'
import type { MessageNotice } from '../gateway/types'
import { emitUserEventForTests } from '../gateway/userLive'
import {
  applyFriendEvent,
  resetFriendsPresenceForTests,
  useFriendsPresence,
} from '../presence/friendsPresence'
import {
  channelLevel,
  communityLevel,
  conversationLevel,
  notifies,
  setLevelsForTests,
} from './levels'
import { resetNotificationSettingsForTests, startMessageNotifications } from './notifications'

const notice: MessageNotice = {
  message_id: 'm1',
  community_id: 'c1',
  community_name: 'Ekip',
  channel_id: 't1',
  channel_name: 'general',
  author_name: 'Ayşe',
  text: 'hi',
  mentioned: false,
}

describe('notification levels (ADR 0018)', () => {
  afterEach(() => {
    setLevelsForTests([])
    resetNotificationSettingsForTests()
    vi.restoreAllMocks()
  })

  it("a channel's own level, else its community's, else all", () => {
    expect(channelLevel('c1', 't1')).toBe('all')
    setLevelsForTests([{ type: 'community', id: 'c1', level: 'none', until: null }])
    expect(channelLevel('c1', 't1')).toBe('none')
    setLevelsForTests([
      { type: 'community', id: 'c1', level: 'none', until: null },
      { type: 'channel', id: 't1', level: 'mentions', until: null },
    ])
    expect(channelLevel('c1', 't1')).toBe('mentions')
    expect(channelLevel('c1', 't2')).toBe('none')
  })

  it('a level with an end stops applying', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    setLevelsForTests([
      { type: 'community', id: 'c1', level: 'none', until: past },
      { type: 'conversation', id: 'd1', level: 'mentions', until: null },
    ])
    expect(communityLevel('c1')).toBe('all')
    expect(conversationLevel('d1')).toBe('mentions')
  })

  it('what notifies at each level', () => {
    expect(notifies('all', false)).toBe(true)
    expect(notifies('mentions', false)).toBe(false)
    expect(notifies('mentions', true)).toBe(true)
    expect(notifies('none', true)).toBe(false)
  })

  it('notifications follow the levels and do not disturb; a click opens the channel', () => {
    // The app is in the background.
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const show = vi.fn(() => Promise.resolve())
    let dnd = false
    const stop = startMessageNotifications('me', () => dnd, show)

    emitUserEventForTests('notify', notice)
    expect(show).toHaveBeenCalledTimes(1)

    setLevelsForTests([{ type: 'channel', id: 't1', level: 'mentions', until: null }])
    emitUserEventForTests('notify', notice)
    expect(show).toHaveBeenCalledTimes(1)
    emitUserEventForTests('notify', { ...notice, mentioned: true })
    expect(show).toHaveBeenCalledTimes(2)

    dnd = true
    emitUserEventForTests('notify', { ...notice, mentioned: true })
    expect(show).toHaveBeenCalledTimes(2)

    dnd = false
    setLevelsForTests([{ type: 'conversation', id: 'd1', level: 'none', until: null }])
    const dm = { conversation_id: 'd1', text: 'x', author: { id: 'a', display_name: 'A' } }
    emitUserEventForTests('dm_created', dm)
    expect(show).toHaveBeenCalledTimes(2)
    emitUserEventForTests('dm_created', { ...dm, conversation_id: 'd2' })
    expect(show).toHaveBeenCalledTimes(3)
    // The user's own message never notifies.
    emitUserEventForTests('dm_created', { ...dm, author: { id: 'me', display_name: 'Me' } })
    expect(show).toHaveBeenCalledTimes(3)
    stop()
  })
})

describe('friends, reactions, desktop links', () => {
  afterEach(resetFriendsPresenceForTests)

  it("friends' status from the user's topic", () => {
    const { result } = renderHook(() => useFriendsPresence())
    act(() =>
      applyFriendEvent('friends_presence', {
        presence: { a: [{ status: 'online', idle: true, avatar: null }] },
      }),
    )
    expect(result.current.get('a')?.status).toBe('idle')
    act(() => applyFriendEvent('friend_presence', { user_id: 'b', metas: [{ status: 'dnd' }] }))
    act(() => applyFriendEvent('friend_presence', { user_id: 'a', metas: [] }))
    expect([...result.current.keys()]).toEqual(['b'])
    expect(result.current.get('b')?.status).toBe('dnd')
  })

  it('who reacted, in a short sentence', () => {
    expect(reactorsText({ names: ['Ayşe'], total: 1 })).toBe('Ayşe')
    expect(reactorsText({ names: ['Ayşe', 'Cem'], total: 2 })).toBe('Ayşe and Cem')
    expect(reactorsText({ names: ['A', 'B', 'C', 'D'], total: 4 })).toBe('A, B, C and 1 other')
    expect(reactorsText({ names: ['A', 'B', 'C'], total: 25 })).toBe('A, B, C and 22 others')
  })

  it('nosilence:// invite links', () => {
    const code = 'abcdefghijklmnop_-12'
    expect(inviteToken(desktopInviteLink(code))).toBe(code)
    expect(inviteToken(`nosilence://invite/${code}`)).toBe(code)
    expect(inviteToken(`nosilence://settings/${code}`)).toBeUndefined()
    expect(inviteToken('nosilence://invite/short')).toBeUndefined()
    expect(inviteToken(`nosilence://invite/${code}/../x`)).toBeUndefined()
  })
})
