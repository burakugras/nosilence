// SPDX-License-Identifier: AGPL-3.0-only
import type { Role } from '../api/communities'

const RANK: Record<Role, number> = { owner: 3, moderator: 2, member: 1 }

/** True if `actor` may act on someone with `target` role (ADR 0012). */
export const outranks = (actor: Role, target: Role) => RANK[actor] > RANK[target]

/** The members choice `index` may offer: not the ones picked in other choices. */
export function choosable<T extends { user_id: string }>(
  members: T[],
  picks: string[],
  index: number,
): T[] {
  return members.filter((m) => !picks.some((p, j) => j !== index && p === m.user_id))
}
