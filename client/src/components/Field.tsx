// SPDX-License-Identifier: AGPL-3.0-only
import { useId, type InputHTMLAttributes } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string
}

/** Labelled input with an accessible error message. */
export function Field({ label, error, ...input }: Props) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </>
  )
}

/** Form-level message: errors are announced to screen readers. */
export function FormMessage({ text, kind = 'error' }: { text?: string; kind?: 'error' | 'info' }) {
  if (!text) return null
  return (
    <p
      className={kind === 'error' ? 'form-message' : 'form-info'}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {text}
    </p>
  )
}
