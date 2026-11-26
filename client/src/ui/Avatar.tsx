// SPDX-License-Identifier: AGPL-3.0-only
import type { Status } from '../presence/status'
import { useAvatarSrc } from './avatars'

// Fixed colours, picked by the person's id, so everyone keeps their colour.
const COLORS = [
  '#6d78ff',
  '#e0679a',
  '#2fa88a',
  '#e08a3c',
  '#8f6be8',
  '#3b9edb',
  '#c2584f',
  '#7a9a2e',
]

function colorFor(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(hash) % COLORS.length]
}

/**
 * The person's profile picture (ADR 0017), or the first letter of the name on a
 * colour; with a status dot if `status` is given. Decorative: the name next to
 * it says who it is.
 */
export function Avatar({
  id,
  name,
  size,
  avatar,
  status,
}: {
  id: string
  name: string
  size?: 'small' | 'large'
  /** Picture version, or null/undefined for none. */
  avatar?: number | null
  status?: Status
}) {
  const src = useAvatarSrc(id, avatar)
  const letter = [...(name.trim() || '?')][0].toLocaleUpperCase()
  return (
    <span
      className={size ? `avatar ${size}` : 'avatar'}
      style={src ? undefined : { background: colorFor(id) }}
      aria-hidden="true"
    >
      {src ? <img src={src} alt="" draggable={false} /> : letter}
      {status && <span className={`presence ${status}`} />}
    </span>
  )
}
