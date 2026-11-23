// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { goBack, navigate, useCanGoBack, useLocation } from './router'

describe('router', () => {
  it('knows when there is a page of the app to go back to', async () => {
    window.history.replaceState(null, '', '/')
    const { result } = renderHook(() => ({ back: useCanGoBack(), path: useLocation().path }))
    expect(result.current.back).toBe(false)

    act(() => navigate('/settings'))
    expect(result.current).toEqual({ back: true, path: '/settings' })
    // Replacing keeps the depth.
    act(() => navigate('/account', { replace: true }))
    expect(result.current.back).toBe(true)

    await act(async () => {
      goBack()
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    })
    expect(result.current).toEqual({ back: false, path: '/' })
  })
})
