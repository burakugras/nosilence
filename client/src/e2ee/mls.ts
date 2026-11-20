// SPDX-License-Identifier: AGPL-3.0-only
import init, { VoiceGroup } from './mls-pkg/nosilence_mls.js'
import type { MlsGroup } from './session'

let ready: Promise<unknown> | undefined

/**
 * Loads the MLS WebAssembly module (built from `client/mls` by `npm run build:mls`).
 * It is part of the lazily loaded voice code, so pages without voice never fetch it.
 */
export async function loadMls(): Promise<(identity: string) => MlsGroup> {
  ready ??= init()
  await ready
  return (identity) => new VoiceGroup(identity)
}
