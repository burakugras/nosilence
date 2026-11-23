// SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useState } from 'react'
import { isDesktop } from '../platform'
import { LevelMeter } from './LevelMeter'
import {
  CAPTURE,
  formatKeys,
  keyId,
  MAX_PUSH_KEYS,
  mouseId,
  normalizeKeys,
  updateVoiceSettings,
  useVoiceSettings,
  type TalkMode,
} from './settings'

/** The browser can send call audio to a chosen speaker (not in Safari). */
const canChooseSpeaker = () =>
  typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype

/**
 * Microphone, speaker, how to talk and the push-to-talk keys (ADR 0013). Used
 * on the settings page and inside a call; in a call `liveTrack` is the
 * microphone being sent, so the meter shows exactly that.
 */
export function VoiceSettingsPanel({ liveTrack }: { liveTrack?: MediaStreamTrack }) {
  const settings = useVoiceSettings()
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [testTrack, setTestTrack] = useState<MediaStreamTrack>()
  const [message, setMessage] = useState<string>()

  const loadDevices = useCallback(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [])

  useEffect(() => {
    loadDevices()
    navigator.mediaDevices?.addEventListener('devicechange', loadDevices)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', loadDevices)
  }, [loadDevices])

  // Stop the test when the panel closes or the call starts sending.
  useEffect(() => () => testTrack?.stop(), [testTrack])

  async function startTest(microphoneId = settings.microphoneId) {
    setMessage(undefined)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { ...CAPTURE, deviceId: microphoneId ? { exact: microphoneId } : undefined },
      })
      setTestTrack(stream.getAudioTracks()[0])
      // Device names are only visible after the user allowed the microphone.
      loadDevices()
    } catch {
      setMessage('The microphone could not be opened. Check that the browser may use it.')
    }
  }

  function chooseMicrophone(id: string) {
    updateVoiceSettings({ microphoneId: id })
    if (testTrack) void startTest(id)
  }

  const inputs = devices.filter((d) => d.kind === 'audioinput')
  const outputs = devices.filter((d) => d.kind === 'audiooutput')
  const unnamed = devices.length > 0 && devices.every((d) => !d.label)
  const label = (d: MediaDeviceInfo, i: number) =>
    d.label || `${d.kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}`
  const meterTrack = liveTrack ?? testTrack

  return (
    <div className="voice-settings stack-form">
      <label className="stack-label">
        Microphone
        <select value={settings.microphoneId} onChange={(e) => chooseMicrophone(e.target.value)}>
          <option value="">System default</option>
          {inputs
            .filter((d) => d.deviceId && d.deviceId !== 'default')
            .map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {label(d, i)}
              </option>
            ))}
        </select>
      </label>
      {unnamed && (
        <p className="muted">Test the microphone once to see the names of your devices.</p>
      )}

      <div className="meter-row">
        <LevelMeter track={meterTrack} />
        {!liveTrack &&
          (testTrack ? (
            <button type="button" className="link-button" onClick={() => setTestTrack(undefined)}>
              Stop test
            </button>
          ) : (
            <button type="button" className="link-button" onClick={() => void startTest()}>
              Test microphone
            </button>
          ))}
      </div>

      {canChooseSpeaker() ? (
        <label className="stack-label">
          Speaker
          <select
            value={settings.speakerId}
            onChange={(e) => updateVoiceSettings({ speakerId: e.target.value })}
          >
            <option value="">System default</option>
            {outputs
              .filter((d) => d.deviceId && d.deviceId !== 'default')
              .map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {label(d, i)}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p className="muted">This browser always plays calls on the system speaker.</p>
      )}

      <fieldset>
        <legend>How you talk</legend>
        {(
          [
            ['voice', 'When I speak (voice activity)'],
            ['push', `Push to talk: hold ${formatKeys(settings.pushKeys)}`],
          ] as [TalkMode, string][]
        ).map(([mode, text]) => (
          <label key={mode} className="radio-label">
            <input
              type="radio"
              name="talk-mode"
              value={mode}
              checked={settings.mode === mode}
              onChange={() => updateVoiceSettings({ mode })}
            />
            {text}
          </label>
        ))}
        {settings.mode === 'push' && (
          <>
            <KeyCapture keys={settings.pushKeys} />
            <p className="muted">
              {isDesktop
                ? 'Works while other apps are in front; the keys keep working there too.'
                : 'In the browser it works while this tab is in front. The desktop app also works while you use other apps.'}
            </p>
          </>
        )}
      </fieldset>
      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}
    </div>
  )
}

/**
 * "Change keys": the user holds the new combination (up to three keys, for
 * example Ctrl + Shift, or a mouse side button) and releases it to save.
 */
function KeyCapture({ keys }: { keys: string[] }) {
  const [capturing, setCapturing] = useState(false)
  const [combo, setCombo] = useState<string[]>([])

  useEffect(() => {
    if (!capturing) return
    const held = new Set<string>()
    let seen: string[] = []
    const press = (id: string | undefined, e: Event) => {
      e.preventDefault()
      if (!id || seen.length >= MAX_PUSH_KEYS) return
      held.add(id)
      if (!seen.includes(id)) seen = [...seen, id]
      setCombo(normalizeKeys(seen))
    }
    const release = (id: string | undefined) => {
      if (!id) return
      held.delete(id)
      if (held.size === 0 && seen.length > 0) {
        updateVoiceSettings({ pushKeys: seen })
        setCapturing(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && seen.length === 0) return setCapturing(false)
      press(keyId(e), e)
    }
    const onKeyUp = (e: KeyboardEvent) => release(keyId(e))
    const onMouseDown = (e: MouseEvent) => {
      const id = mouseId(e.button)
      if (id) press(id, e)
    }
    const onMouseUp = (e: MouseEvent) => release(mouseId(e.button))
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [capturing])

  return (
    <p className="key-capture" aria-live="polite">
      {capturing ? (
        <>
          <strong>{combo.length > 0 ? formatKeys(combo) : 'Hold the new keys…'}</strong>{' '}
          <span className="muted">Release to save, Escape to cancel.</span>
        </>
      ) : (
        <>
          Keys: <kbd>{formatKeys(keys)}</kbd>{' '}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setCombo([])
              setCapturing(true)
            }}
          >
            Change keys
          </button>
        </>
      )}
    </p>
  )
}
