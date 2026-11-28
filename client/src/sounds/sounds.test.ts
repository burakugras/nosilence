// SPDX-License-Identifier: AGPL-3.0-only
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emitUserEventForTests } from '../gateway/userLive'
import { setLevelsForTests } from '../notifications/levels'
import { setBlockedForTests } from '../social/blockedStore'
import { endCall, startCall } from '../voice/call'
import {
  reportCall,
  resetCallState,
  resetControlsForTests,
  toggleDeafen,
  toggleMute,
} from '../voice/callState'
import type { SoundName } from './engine'
import {
  allowed,
  controlSound,
  resetSoundSettingsForTests,
  setPlayerForTests,
  startSounds,
  statusSounds,
  updateSoundSettings,
} from './sounds'

const secured = (members: string[]) => ({
  state: 'secured' as const,
  epoch: 1,
  members,
  code: '1',
})

describe('interaction sounds (ADR 0020)', () => {
  let played: SoundName[]
  let stop: () => void

  beforeEach(() => {
    localStorage.clear()
    resetSoundSettingsForTests()
    resetControlsForTests()
    played = []
    setPlayerForTests((name) => played.push(name))
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
    stop = startSounds('me')
  })

  afterEach(() => {
    stop()
    act(() => endCall())
    resetCallState()
    setLevelsForTests([])
    setBlockedForTests([])
    vi.restoreAllMocks()
  })

  const call = {
    communityId: 'c',
    communityName: 'C',
    channel: { id: 'v', name: 'General', kind: 'voice' as const, capacity: 8 },
    join: { url: 'ws://x', token: 't', room: 'v', identity: 'me' },
    startedAt: 0,
  }

  it('joining (once the microphone is open), others coming and going, leaving', () => {
    vi.useFakeTimers()
    try {
      act(() => startCall(call))
      reportCall({ status: { state: 'securing' } })
      reportCall({ status: secured(['me']) })
      // Opening the microphone cuts audio off for a moment: the join sound waits.
      expect(played).toEqual([])
      reportCall({ micTrack: {} as MediaStreamTrack })
      vi.advanceTimersByTime(249)
      expect(played).toEqual([])
      vi.advanceTimersByTime(1)
      expect(played).toEqual(['join'])
      reportCall({ status: secured(['me', 'ayse']) })
      reportCall({ status: secured(['me']) })
      act(() => endCall())
      expect(played).toEqual(['join', 'otherJoin', 'otherLeave', 'leave'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('the join sound waits for the microphone at most 1.5 s (push-to-talk opens it later)', () => {
    vi.useFakeTimers()
    try {
      act(() => startCall(call))
      reportCall({ status: secured(['me']) })
      vi.advanceTimersByTime(1499)
      expect(played).toEqual([])
      vi.advanceTimersByTime(1)
      expect(played).toEqual(['join'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('mute and deafen sound; deafen silences others', () => {
    toggleMute()
    toggleMute()
    toggleDeafen()
    expect(played).toEqual(['mute', 'unmute', 'deafen'])
    // Deafened: someone mentioning the user makes no sound.
    emitUserEventForTests('dm_created', {
      conversation_id: 'd',
      author: { id: 'a' },
      mentions: ['me'],
    })
    toggleDeafen()
    expect(played).toEqual(['mute', 'unmute', 'deafen', 'undeafen'])
  })

  it('direct messages and mentions, by level, never from blocked people or in the background', () => {
    const dm = { conversation_id: 'd', author: { id: 'a' }, mentions: [] as string[] }
    emitUserEventForTests('dm_created', dm)
    emitUserEventForTests('dm_created', { ...dm, author: { id: 'me' } })
    expect(played).toEqual(['message'])

    setLevelsForTests([{ type: 'conversation', id: 'd', level: 'mentions', until: null }])
    emitUserEventForTests('dm_created', dm)
    emitUserEventForTests('dm_created', { ...dm, mentions: ['me'] })
    expect(played).toEqual(['message', 'mention'])

    setBlockedForTests(['a'])
    emitUserEventForTests('dm_created', { ...dm, mentions: ['me'] })
    setBlockedForTests([])

    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    emitUserEventForTests('notify', {
      community_id: 'c',
      channel_id: 't',
      mentioned: true,
    })
    expect(played).toEqual(['message', 'mention'])
  })

  it('the settings turn groups off, and volume 0 silences all', () => {
    updateSoundSettings({ voice: false })
    toggleMute()
    expect(played).toEqual([])
    updateSoundSettings({ voice: true, volume: 0 })
    toggleMute()
    expect(played).toEqual([])
  })
})

describe('sound rules', () => {
  it('what a switch change sounds like', () => {
    const off = { muted: false, deafened: false }
    expect(controlSound(off, { muted: true, deafened: false })).toBe('mute')
    expect(controlSound(off, { muted: true, deafened: true })).toBe('deafen')
    expect(controlSound({ muted: true, deafened: true }, { muted: true, deafened: false })).toBe(
      'undeafen',
    )
    expect(controlSound(off, off)).toBeUndefined()
  })

  it('status changes', () => {
    expect(statusSounds(null, secured(['me']), 'me')).toEqual(['join'])
    expect(statusSounds(secured(['me', 'a']), secured(['me', 'b']), 'me')).toEqual([
      'otherJoin',
      'otherLeave',
    ])
    expect(statusSounds(secured(['me']), { state: 'securing' }, 'me')).toEqual([])
  })

  it('allowed', () => {
    const s = { volume: 0.5, voice: true, messages: false }
    expect(allowed('mute', s, { muted: false, deafened: false })).toBe(true)
    expect(allowed('mention', s, { muted: false, deafened: false })).toBe(false)
    expect(allowed('otherJoin', s, { muted: true, deafened: true })).toBe(false)
    expect(allowed('deafen', s, { muted: true, deafened: true })).toBe(true)
  })
})
