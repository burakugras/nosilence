// SPDX-License-Identifier: AGPL-3.0-only
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DownloadedUpdate } from '../platform'
import { checkForUpdates, resetUpdatesForTests } from './updates'
import { UpdateBanner, UpdateCorner } from './UpdateViews'

describe('desktop updates', () => {
  beforeEach(resetUpdatesForTests)

  it('offers a downloaded update and installs it only when asked', async () => {
    const install = vi.fn(() => Promise.resolve())
    const found = (): Promise<DownloadedUpdate | null> =>
      Promise.resolve({ version: '0.2.0', install })
    render(<UpdateBanner />)
    expect(screen.queryByRole('status')).toBeNull()

    await act(() => checkForUpdates(found))
    expect(screen.getByRole('status')).toHaveTextContent('Nosilence 0.2.0 is ready.')
    expect(install).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Restart now' }))
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce())
  })

  it('"Later" hides the banner', async () => {
    render(<UpdateBanner />)
    await act(() => checkForUpdates(() => Promise.resolve({ version: '0.2.0', install: vi.fn() })))
    fireEvent.click(screen.getByRole('button', { name: 'Later' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('shows nothing when there is no update or the check fails', async () => {
    render(<UpdateBanner />)
    await act(() => checkForUpdates(() => Promise.resolve(null)))
    expect(screen.queryByRole('status')).toBeNull()
    await act(() => checkForUpdates(() => Promise.reject(new Error('offline'))))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('does not check twice at once', async () => {
    let calls = 0
    const slow = () => {
      calls += 1
      return new Promise<null>((resolve) => setTimeout(() => resolve(null), 10))
    }
    await Promise.all([checkForUpdates(slow), checkForUpdates(slow)])
    expect(calls).toBe(1)
  })

  it('the corner checks for updates and offers the restart', async () => {
    render(<UpdateCorner />)
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled()

    await act(() => checkForUpdates(() => Promise.resolve(null)))
    expect(screen.getByRole('status')).toHaveTextContent('Up to date')

    resetUpdatesForTests()
    const install = vi.fn(() => Promise.resolve())
    await act(() => checkForUpdates(() => Promise.resolve({ version: '0.2.0', install })))
    expect(screen.getByText('· 0.2.0 is ready')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }))
    await vi.waitFor(() => expect(install).toHaveBeenCalledOnce())
  })
})
