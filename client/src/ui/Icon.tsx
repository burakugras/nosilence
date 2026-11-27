// SPDX-License-Identifier: AGPL-3.0-only
/* Simple line icons (24 x 24), drawn with the current text colour. */

const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  plus: 'M12 5v14M5 12h14',
  hash: 'M5 9h14M4 15h14M10 3L8 21M16 3l-2 18',
  speaker: 'M11 5L6 9H3v6h3l5 4zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  mic: 'M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3',
  micOff:
    'M3 3l18 18M9 9v2a3 3 0 005 2.2M15 9.3V6a3 3 0 00-5.9-.7M5 11a7 7 0 0011.5 5.3M19 11a7 7 0 01-.6 2.8M12 18v3',
  headphones: 'M3 18v-6a9 9 0 0118 0v6M3 15h4v6H4a1 1 0 01-1-1zM17 15h4v5a1 1 0 01-1 1h-3z',
  headphonesOff: 'M3 3l18 18M3 18v-6a9 9 0 0115-6.7M21 12v6M3 15h4v6H4a1 1 0 01-1-1z',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  leave: 'M16 17l5-5-5-5M21 12H9M13 21H5a2 2 0 01-2-2V5a2 2 0 012-2h8',
  people: 'M9 4a4 4 0 100 8 4 4 0 000-8zM2 21a7 7 0 0114 0M16 4a4 4 0 010 8M22 21a7 7 0 00-5-6.7',
  lock: 'M6 11h12a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2v-6a2 2 0 012-2zM8 11V7a4 4 0 018 0v4',
  chevron: 'M6 9l6 6 6-6',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6L6 18',
  chat: 'M21 12a8 8 0 01-11.6 7.1L3 21l1.9-6.4A8 8 0 1121 12z',
  back: 'M15 18l-6-6 6-6',
  invite: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 3a4 4 0 100 8 4 4 0 000-8zM19 8v6M22 11h-6',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  bell: 'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 003.4 0',
  at: 'M16 12a4 4 0 10-8 0 4 4 0 008 0zM16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.5 7.1',
  bellOff:
    'M3 3l18 18M8.7 3.7A6 6 0 0118 8c0 3 .6 5 1.3 6.4M17 17H3s3-2 3-9c0-.5 0-1 .1-1.4M10.3 21a1.9 1.9 0 003.4 0',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
