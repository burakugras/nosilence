// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'

export type ModalSection = { id: string; label: string; danger?: boolean }

/**
 * A large settings window with its sections listed on the left (user settings,
 * community settings). Escape, the close button or a click outside closes it;
 * Tab stays inside while it is open, and focus returns to where it was.
 */
export function SettingsModal({
  title,
  sections,
  current,
  onSection,
  onClose,
  children,
}: {
  title: string
  sections: ModalSection[]
  current: string
  onSection: (id: string) => void
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)

  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement
    ref.current?.querySelector<HTMLElement>('nav button[aria-current="page"]')?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current()
      if (e.key !== 'Tab' || !ref.current) return
      const items = ref.current.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last?.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div ref={ref} className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="settings">
          <nav aria-label={title}>
            <p className="section-title">{title}</p>
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                className={s.danger ? 'danger-item' : undefined}
                aria-current={s.id === current ? 'page' : undefined}
                onClick={() => onSection(s.id)}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <section aria-label={sections.find((s) => s.id === current)?.label}>
            <button
              type="button"
              className="icon-button close"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon name="close" />
            </button>
            {children}
          </section>
        </div>
      </div>
    </div>
  )
}
