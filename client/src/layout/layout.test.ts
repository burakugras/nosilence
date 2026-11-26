// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import { initials } from '../communities/communityList'
import { setThemeChoice } from '../theme'
import {
  connectionQuality,
  getControls,
  resetControlsForTests,
  toggleDeafen,
  toggleMute,
} from '../voice/callState'

describe('theme', () => {
  it('applies the choice to <html> and keeps it on this device', () => {
    setThemeChoice('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('nosilence.theme')).toBe('light')
    setThemeChoice('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})

describe('mute and deafen', () => {
  beforeEach(resetControlsForTests)

  it('deafening also mutes; undeafening brings back the earlier mute', () => {
    toggleDeafen()
    expect(getControls()).toEqual({ muted: true, deafened: true })
    toggleDeafen()
    expect(getControls()).toEqual({ muted: false, deafened: false })

    toggleMute()
    toggleDeafen()
    toggleDeafen()
    expect(getControls()).toEqual({ muted: true, deafened: false })
  })

  it('unmuting while deafened undeafens too: talking needs hearing', () => {
    toggleDeafen()
    toggleMute()
    expect(getControls()).toEqual({ muted: false, deafened: false })
  })
})

describe('small helpers', () => {
  it('connection quality from round trip and loss', () => {
    expect(connectionQuality()).toBeUndefined()
    expect(connectionQuality(40, 0.001)).toBe('good')
    expect(connectionQuality(200, 0)).toBe('fair')
    expect(connectionQuality(40, 0.05)).toBe('fair')
    expect(connectionQuality(40, 0.2)).toBe('poor')
  })

  it('two letters for the rail', () => {
    expect(initials('Oyun Gecesi')).toBe('OG')
    expect(initials('Ekip')).toBe('EK')
    expect(initials('  şehir  takımı ')).toBe('ŞT')
  })
})
