// SPDX-License-Identifier: AGPL-3.0-only
// The parts of the Phoenix channels client (phoenix 1.8, MIT) that we use.
// The package ships no types and @types/phoenix is for 1.6.
declare module 'phoenix' {
  type Callback<T = unknown> = (payload: T) => void

  export class Push {
    receive(status: 'ok' | 'error' | 'timeout', callback: Callback<any>): Push
  }

  export class Channel {
    join(timeout?: number): Push
    leave(timeout?: number): Push
    push(event: string, payload: object, timeout?: number): Push
    on(event: string, callback: Callback<any>): number
    off(event: string, ref?: number): void
    onError(callback: Callback): number
    onClose(callback: Callback): number
  }

  export type SocketOptions = {
    /** Sent in the WebSocket handshake header; called again on every reconnect. */
    authToken?: string | (() => string)
    reconnectAfterMs?: (tries: number) => number
    rejoinAfterMs?: (tries: number) => number
    heartbeatIntervalMs?: number
    timeout?: number
  }

  export class Socket {
    constructor(endPoint: string, opts?: SocketOptions)
    connect(): void
    disconnect(callback?: () => void, code?: number, reason?: string): void
    channel(topic: string, params?: object): Channel
    isConnected(): boolean
    onOpen(callback: () => void): string
    onError(callback: Callback): string
    onClose(callback: Callback): string
  }

  export type PresenceMeta = { phx_ref: string; [key: string]: unknown }
  export type PresenceEntry = { metas: PresenceMeta[] }

  export class Presence {
    constructor(channel: Channel)
    onSync(callback: () => void): void
    list<T>(chooser: (key: string, entry: PresenceEntry) => T): T[]
  }
}
