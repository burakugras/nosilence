// SPDX-License-Identifier: AGPL-3.0-only
import { describe, expect, it } from 'vitest'
import { watchInWindow } from './pushToTalk'

const key = (type: string, key: string, code = key) =>
  window.dispatchEvent(new KeyboardEvent(type, { key, code }))

describe('push-to-talk in the browser', () => {
  it('talks only while every key is held', () => {
    const changes: boolean[] = []
    const stop = watchInWindow(['Ctrl', 'Shift'], (down) => changes.push(down))

    key('keydown', 'Control', 'ControlLeft')
    expect(changes).toEqual([])
    key('keydown', 'Shift', 'ShiftLeft')
    expect(changes).toEqual([true])
    // Holding more keys (Ctrl + Shift + T) still talks; repeats change nothing.
    key('keydown', 't', 'KeyT')
    key('keydown', 'Shift', 'ShiftLeft')
    expect(changes).toEqual([true])
    key('keyup', 'Shift', 'ShiftLeft')
    expect(changes).toEqual([true, false])
    stop()
  })

  it('stops talking when the window loses focus or watching stops', () => {
    const changes: boolean[] = []
    const stop = watchInWindow(['F8'], (down) => changes.push(down))
    key('keydown', 'F8')
    window.dispatchEvent(new Event('blur'))
    expect(changes).toEqual([true, false])

    key('keydown', 'F8')
    stop()
    expect(changes).toEqual([true, false, true, false])
    key('keydown', 'F8')
    expect(changes).toHaveLength(4)
  })

  it('works with a mouse side button', () => {
    const changes: boolean[] = []
    const stop = watchInWindow(['Mouse4'], (down) => changes.push(down))
    window.dispatchEvent(new MouseEvent('mousedown', { button: 3 }))
    window.dispatchEvent(new MouseEvent('mouseup', { button: 3 }))
    expect(changes).toEqual([true, false])
    stop()
  })
})
