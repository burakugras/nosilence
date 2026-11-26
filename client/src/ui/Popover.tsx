// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

/**
 * A small floating panel next to `anchor` (a menu, a member card). Closes on a
 * click outside or on Escape, and gives focus back to the anchor.
 */
export function Popover({
  anchor,
  side = 'below',
  label,
  onClose,
  className,
  children,
}: {
  anchor: HTMLElement
  side?: 'below' | 'left'
  label: string
  onClose: () => void
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = anchor.getBoundingClientRect()
    const w = el.offsetWidth
    const h = el.offsetHeight
    let left = side === 'left' ? r.left - w - 8 : r.left
    let top = side === 'left' ? r.top : r.bottom + 6
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.querySelector<HTMLElement>('button, a, input')?.focus()
  }, [anchor, side])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!ref.current?.contains(target) && !anchor.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      onClose()
      anchor.focus()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return (
    <div
      ref={ref}
      className={className ? `popover ${className}` : 'popover'}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  )
}
