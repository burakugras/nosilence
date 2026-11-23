// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { getVoiceSettings, resetVoiceSettingsForTests } from './settings'
import { VoiceSettingsPanel } from './VoiceSettingsPanel'

const device = (kind: MediaDeviceKind, deviceId: string, label: string) =>
  ({ kind, deviceId, label, groupId: '' }) as MediaDeviceInfo

const keyboard = (type: string, key: string, code: string) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key, code }))
  })

describe('VoiceSettingsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    resetVoiceSettingsForTests()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: () =>
          Promise.resolve([
            device('audioinput', 'default', 'Default'),
            device('audioinput', 'mic-1', 'USB headset'),
            device('audiooutput', 'spk-1', 'Speakers'),
          ]),
        addEventListener: () => {},
        removeEventListener: () => {},
      },
    })
  })

  it('chooses the microphone and keeps the choice', async () => {
    render(<VoiceSettingsPanel />)
    await screen.findByRole('option', { name: 'USB headset' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Microphone' }), {
      target: { value: 'mic-1' },
    })
    expect(getVoiceSettings().microphoneId).toBe('mic-1')
    // "Default" is the same as "System default", so it is not listed twice.
    expect(screen.queryByRole('option', { name: 'Default' })).toBeNull()
  })

  it('switches to push-to-talk and records new keys', async () => {
    render(<VoiceSettingsPanel />)
    await screen.findByRole('option', { name: 'USB headset' })
    fireEvent.click(screen.getByRole('radio', { name: 'Push to talk: hold Ctrl + Shift' }))
    expect(getVoiceSettings().mode).toBe('push')

    fireEvent.click(screen.getByRole('button', { name: 'Change keys' }))
    keyboard('keydown', 'Alt', 'AltLeft')
    keyboard('keydown', 'v', 'KeyV')
    expect(screen.getByText('Alt + V')).toBeInTheDocument()
    keyboard('keyup', 'v', 'KeyV')
    keyboard('keyup', 'Alt', 'AltLeft')
    expect(getVoiceSettings().pushKeys).toEqual(['Alt', 'KeyV'])
    expect(screen.getByRole('radio', { name: 'Push to talk: hold Alt + V' })).toBeChecked()
  })

  it('Escape cancels recording keys', async () => {
    render(<VoiceSettingsPanel />)
    await screen.findByRole('option', { name: 'USB headset' })
    fireEvent.click(screen.getByRole('radio', { name: /Push to talk/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Change keys' }))
    keyboard('keydown', 'Escape', 'Escape')
    expect(screen.getByRole('button', { name: 'Change keys' })).toBeInTheDocument()
    expect(getVoiceSettings().pushKeys).toEqual(['Ctrl', 'Shift'])
  })
})
