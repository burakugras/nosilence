// SPDX-License-Identifier: AGPL-3.0-only

export type VoiceJoin = {
  token: string
  url: string
  room: string
  identity: string
}

export type FieldErrors = Partial<Record<'room' | 'name', string>>

export class VoiceJoinError extends Error {
  readonly fieldErrors: FieldErrors

  constructor(message: string, fieldErrors: FieldErrors = {}) {
    super(message)
    this.name = 'VoiceJoinError'
    this.fieldErrors = fieldErrors
  }
}

/**
 * Phase 1: asks the development endpoint for a LiveKit token.
 * Replaced by an authenticated request in Phase 2-3.
 */
export async function requestVoiceJoin(
  room: string,
  name: string,
  fetchFn: typeof fetch = fetch,
): Promise<VoiceJoin> {
  let response: Response
  try {
    response = await fetchFn('/api/dev/voice-token', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ room, name }),
    })
  } catch {
    throw new VoiceJoinError('Cannot reach the server. Is it running?')
  }

  if (response.status === 422) {
    const body = (await response.json()) as { errors?: FieldErrors }
    throw new VoiceJoinError('Please check the form.', body.errors ?? {})
  }
  if (!response.ok) {
    throw new VoiceJoinError(`The server answered with ${response.status}.`)
  }
  return (await response.json()) as VoiceJoin
}
