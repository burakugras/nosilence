// SPDX-License-Identifier: AGPL-3.0-only
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { navigate, useLocation } from './router'

describe('router', () => {
  it('follows navigation and the browser going back', async () => {
    window.history.replaceState(null, '', '/')
    const { result } = renderHook(() => useLocation())
    expect(result.current.path).toBe('/')

    act(() => navigate('/settings?x=1'))
    expect(result.current.path).toBe('/settings')
    expect(result.current.params.get('x')).toBe('1')
    act(() => navigate('/account', { replace: true }))
    expect(result.current.path).toBe('/account')

    await act(async () => {
      window.history.back()
      await new Promise((resolve) => window.addEventListener('popstate', resolve, { once: true }))
    })
    expect(result.current.path).toBe('/')
  })
})
