// SPDX-License-Identifier: AGPL-3.0-only

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

/** The first letter of the name on a colour; with an online/offline dot if `online` is given. */
export function Avatar({
  id,
  name,
  size,
  online,
}: {
  id: string
  name: string
  size?: 'small' | 'large'
  online?: boolean
}) {
  const letter = [...(name.trim() || '?')][0].toLocaleUpperCase()
  return (
    <span
      className={size ? `avatar ${size}` : 'avatar'}
      style={{ background: colorFor(id) }}
      aria-hidden="true"
    >
      {letter}
      {online !== undefined && <span className={online ? 'presence on' : 'presence'} />}
    </span>
  )
}
