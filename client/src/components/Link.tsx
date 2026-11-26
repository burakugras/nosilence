// SPDX-License-Identifier: AGPL-3.0-only
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { navigate } from '../router'

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'> & {
  to: string
  children: ReactNode
}

/** In-app link: a real <a> (works with new tabs and screen readers), no page reload. */
export function Link({ to, children, ...rest }: Props) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return
    event.preventDefault()
    navigate(to)
  }
  return (
    <a {...rest} href={to} onClick={onClick}>
      {children}
    </a>
  )
}
