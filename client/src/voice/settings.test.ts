// SPDX-License-Identifier: AGPL-3.0-only
import { beforeEach, describe, expect, it } from 'vitest'
import {
  formatKeys,
  getVoiceSettings,
  keyId,
  mouseId,
  normalizeKeys,
  resetVoiceSettingsForTests,
  updateVoiceSettings,
} from './settings'

describe('voice settings', () => {
  beforeEach(() => {
    localStorage.clear()
    resetVoiceSettingsForTests()
  })

  it('defaults to voice activity with Ctrl + Shift for push-to-talk', () => {
    expect(getVoiceSettings()).toEqual({
      microphoneId: '',
      speakerId: '',
      mode: 'voice',
      pushKeys: ['Ctrl', 'Shift'],
    })
  })

  it('keeps the settings on this device', () => {
    updateVoiceSettings({ mode: 'push', pushKeys: ['KeyV', 'Ctrl'], microphoneId: 'mic-2' })
    resetVoiceSettingsForTests()
    expect(getVoiceSettings()).toMatchObject({
      mode: 'push',
      pushKeys: ['Ctrl', 'KeyV'],
      microphoneId: 'mic-2',
    })
  })

  it('ignores broken or unknown stored values', () => {
    localStorage.setItem('nosilence.voice-settings', '{"mode":"shout","pushKeys":["Meta",5]}')
    expect(getVoiceSettings()).toMatchObject({ mode: 'voice', pushKeys: ['Ctrl', 'Shift'] })
    localStorage.setItem('nosilence.voice-settings', 'not json')
    resetVoiceSettingsForTests()
    expect(getVoiceSettings().mode).toBe('voice')
  })

  it('names keys the same way on both sides of the keyboard', () => {
    expect(keyId({ key: 'Control', code: 'ControlRight' })).toBe('Ctrl')
    expect(keyId({ key: 'Shift', code: 'ShiftLeft' })).toBe('Shift')
    expect(keyId({ key: 'v', code: 'KeyV' })).toBe('KeyV')
    expect(keyId({ key: 'F8', code: 'F8' })).toBe('F8')
    expect(keyId({ key: 'Meta', code: 'MetaLeft' })).toBeUndefined()
    expect(keyId({ key: 'Enter', code: 'Enter' })).toBeUndefined()
    expect(mouseId(3)).toBe('Mouse4')
    expect(mouseId(0)).toBeUndefined()
  })

  it('orders modifiers first and shows keys readably', () => {
    expect(normalizeKeys(['KeyV', 'Shift', 'Ctrl', 'Shift'])).toEqual(['Ctrl', 'Shift', 'KeyV'])
    expect(formatKeys(['Ctrl', 'Shift'])).toBe('Ctrl + Shift')
    expect(formatKeys(['Alt', 'Digit1', 'Mouse5'])).toBe('Alt + 1 + Mouse 5')
  })
})
