// SPDX-License-Identifier: AGPL-3.0-only
import { BaseKeyProvider, createKeyMaterialFromBuffer } from 'livekit-client'

/** LiveKit's key ring has 16 slots; epoch N uses slot N mod 16. */
export const KEYRING_SIZE = 16

/**
 * Hands each epoch's MLS voice key to LiveKit's E2EE. All members share one key
 * per epoch. Frames carry the slot number, so a receiver still holding the
 * previous key can decrypt frames sent just before a change.
 */
export class MlsKeyProvider extends BaseKeyProvider {
  constructor() {
    super({
      sharedKey: true,
      keyringSize: KEYRING_SIZE,
      // Keys come from MLS only: never ratchet or give up on our own.
      ratchetWindowSize: 0,
      failureTolerance: -1,
    })
  }

  async setEpochKey(key: Uint8Array, epoch: number) {
    const material = await createKeyMaterialFromBuffer(new Uint8Array(key).buffer)
    this.onSetEncryptionKey(material, undefined, epoch % KEYRING_SIZE)
  }
}
