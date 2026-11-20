// SPDX-License-Identifier: AGPL-3.0-only
import { apiOrigin, isDesktop, sessionToken } from '../platform'

/** Field name → messages, as returned by the server for invalid input. */
export type FieldErrors = Record<string, string[] | string>

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: FieldErrors
  /** Seconds to wait before trying again (429 responses carry `Retry-After`). */
  readonly retryAfter?: number

  constructor(message: string, status: number, fieldErrors: FieldErrors = {}, retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
    this.retryAfter = retryAfter
  }

  /** First message for a field, or undefined. */
  field(name: string): string | undefined {
    const value = this.fieldErrors[name]
    return Array.isArray(value) ? value[0] : value
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  fetchFn?: typeof fetch
}

/**
 * JSON request to our own API. On the web the session lives in an HttpOnly
 * cookie that the browser sends by itself (same origin); this code never sees
 * it. The desktop app sends its stored token as a bearer header instead.
 */
export async function request<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, fetchFn = fetch } = options
  const token = await sessionToken()
  let response: Response
  try {
    response = await fetchFn(apiOrigin + path, {
      method,
      credentials: isDesktop ? 'omit' : 'same-origin',
      headers: {
        accept: 'application/json',
        // The server refuses state-changing requests that are not JSON (CSRF protection).
        ...(method === 'GET' ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Cannot reach the server. Is it running?', 0)
  }

  if (response.status === 204) return undefined as T

  const data = (await response.json().catch(() => ({}))) as {
    error?: string
    errors?: FieldErrors
  } & T

  if (!response.ok) {
    const message =
      data.error ?? (data.errors ? 'Please check the form.' : `Server error ${response.status}.`)
    const retryAfter = Number(response.headers.get('retry-after')) || undefined
    throw new ApiError(message, response.status, data.errors ?? {}, retryAfter)
  }
  return data
}
