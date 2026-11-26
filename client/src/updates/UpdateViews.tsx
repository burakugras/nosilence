// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useState } from 'react'
import { appVersion } from '../platform'
import {
  checkForUpdates,
  dismissUpdateBanner,
  installUpdate,
  useBannerDismissed,
  useUpdateState,
} from './updates'

/** Shown at the top of the desktop app once a new version is downloaded. */
export function UpdateBanner() {
  const state = useUpdateState()
  const dismissed = useBannerDismissed()
  if (state.status === 'installing')
    return (
      <p className="update-banner" role="status">
        Installing Nosilence {state.version}…
      </p>
    )
  if (state.status !== 'ready' || dismissed) return null
  return (
    <div className="update-banner" role="status">
      Nosilence {state.version} is ready. Restarting leaves any call you are in.{' '}
      <button type="button" onClick={() => void installUpdate()}>
        Restart now
      </button>{' '}
      <button type="button" className="link-button" onClick={dismissUpdateBanner}>
        Later
      </button>
    </div>
  )
}

const MESSAGES: Partial<Record<ReturnType<typeof useUpdateState>['status'], string>> = {
  checking: 'Checking…',
  latest: 'Up to date',
  failed: 'Could not check',
}

/**
 * Bottom right corner of the desktop app, signed in or not: the version and
 * "Check for updates", or "Restart" once a new version is downloaded.
 */
export function UpdateCorner() {
  const state = useUpdateState()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    appVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  return (
    <footer className="update-corner" aria-label="App version">
      <span>Nosilence {version ?? ''}</span>
      {state.status === 'ready' ? (
        <>
          <span>· {state.version} is ready</span>
          <button type="button" className="link-button" onClick={() => void installUpdate()}>
            Restart to update
          </button>
        </>
      ) : (
        <>
          {MESSAGES[state.status] && <span role="status">· {MESSAGES[state.status]}</span>}
          <button
            type="button"
            className="link-button"
            disabled={state.status === 'checking' || state.status === 'installing'}
            onClick={() => void checkForUpdates()}
          >
            Check for updates
          </button>
        </>
      )}
    </footer>
  )
}

/** Settings > About, desktop app: the version, checking and restarting (ADR 0014). */
export function AboutSection() {
  const state = useUpdateState()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    appVersion()
      .then(setVersion)
      .catch(() => setVersion(null))
  }, [])

  return (
    <>
      <h2>About</h2>
      <p>Nosilence {version ?? ''}</p>
      {state.status === 'ready' ? (
        <p>
          Version {state.version} is ready.{' '}
          <button type="button" onClick={() => void installUpdate()}>
            Restart to update
          </button>
        </p>
      ) : (
        <button
          type="button"
          className="secondary"
          disabled={state.status === 'checking' || state.status === 'installing'}
          onClick={() => void checkForUpdates()}
        >
          Check for updates
        </button>
      )}
      {MESSAGES[state.status] && <p role="status">{MESSAGES[state.status]}</p>}
    </>
  )
}
