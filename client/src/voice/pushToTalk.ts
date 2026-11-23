// SPDX-License-Identifier: AGPL-3.0-only
import { desktopPushToTalk, isDesktop } from '../platform'
import { keyId, mouseId } from './settings'

/**
 * Calls `onChange(true)` when every key in `keys` is held and `onChange(false)`
 * when one is released. Returns a function that stops watching.
 *
 * The desktop app watches the keys even while another app is in front (the
 * Rust side polls only these keys, ADR 0013). A browser only tells a page about
 * keys while it is focused, so on the web push-to-talk works in the open tab.
 */
export function watchPushToTalk(keys: string[], onChange: (down: boolean) => void): () => void {
  return isDesktop ? desktopPushToTalk(keys, onChange) : watchInWindow(keys, onChange)
}

export function watchInWindow(
  keys: string[],
  onChange: (down: boolean) => void,
  target: Window = window,
): () => void {
  const held = new Set<string>()
  let down = false
  const update = () => {
    const now = keys.length > 0 && keys.every((k) => held.has(k))
    if (now !== down) {
      down = now
      onChange(now)
    }
  }
  const press = (id: string | undefined) => {
    if (!id) return
    held.add(id)
    update()
  }
  const release = (id: string | undefined) => {
    if (!id) return
    held.delete(id)
    update()
  }
  const onKeyDown = (e: KeyboardEvent) => press(keyId(e))
  const onKeyUp = (e: KeyboardEvent) => release(keyId(e))
  const onMouseDown = (e: MouseEvent) => press(mouseId(e.button))
  const onMouseUp = (e: MouseEvent) => release(mouseId(e.button))
  // Keys released while another window had focus never send keyup here.
  const onBlur = () => {
    held.clear()
    update()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('mousedown', onMouseDown)
  target.addEventListener('mouseup', onMouseUp)
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('mousedown', onMouseDown)
    target.removeEventListener('mouseup', onMouseUp)
    target.removeEventListener('blur', onBlur)
    if (down) onChange(false)
  }
}
