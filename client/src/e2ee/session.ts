// SPDX-License-Identifier: AGPL-3.0-only
import type { OpenVoiceTopic, VoiceTopic } from '../gateway/types'

/** The MLS operations we use (implemented in Rust, `client/mls`). */
export type MlsGroup = {
  keyPackage(): Uint8Array
  create(groupId: Uint8Array): void
  add(keyPackage: Uint8Array, expectedIdentity: string): MlsCommit
  remove(identity: string): MlsCommit
  mergePending(): void
  discardPending(): void
  applyCommit(commit: Uint8Array): void
  join(welcome: Uint8Array, expectedGroupId: Uint8Array): void
  voiceKey(): Uint8Array
  epoch(): number
  members(): string[]
  verificationCode(): string
  free(): void
}

export type MlsCommit = { readonly commit: Uint8Array; readonly welcome?: Uint8Array; free(): void }

export type E2eeStatus =
  | { state: 'securing' }
  | { state: 'secured'; epoch: number; members: string[]; code: string }
  | { state: 'ended'; reason: 'removed' | 'superseded' | 'failed' }

type Options = {
  channelId: string
  identity: string
  newGroup: (identity: string) => MlsGroup
  openTopic: OpenVoiceTopic
  /** A new 32-byte voice key for `epoch`; hand it to LiveKit. */
  onKey: (key: Uint8Array, epoch: number) => void
  onStatus: (status: E2eeStatus) => void
}

const fromB64 = (s: unknown) => Uint8Array.from(atob(String(s)), (c) => c.charCodeAt(0))
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

/** Starting over more often than this means something is wrong: stop (fail closed). */
const MAX_RESTARTS = 3
const RESTART_WINDOW_MS = 30_000

/**
 * One device's part in a voice channel's MLS group (ADR 0007).
 *
 * The server tells us to create the group, sends us a Welcome, asks us to
 * commit someone's join or leave, or forwards another member's commit. Each
 * change gives a new epoch and a new voice key. If our state ever disagrees
 * with the server's, we start over with fresh keys rather than guess.
 */
export class VoiceSession {
  private mls?: MlsGroup
  private topic?: VoiceTopic
  private groupId?: Uint8Array
  private secured = false
  private stopped = false
  private restarts: number[] = []
  // Each start() opens a new topic; signals from older ones are ignored.
  private generation = 0
  // Handle server messages strictly one after another.
  private queue: Promise<void> = Promise.resolve()
  private readonly o: Options

  constructor(options: Options) {
    this.o = options
  }

  start() {
    const generation = ++this.generation
    const current = () => generation === this.generation && !this.stopped
    this.secured = false
    this.o.onStatus({ state: 'securing' })
    this.topic = this.o.openTopic(
      this.o.channelId,
      // Called on every (re)join: a new group membership needs a new key package.
      () => {
        this.reset()
        this.mls = this.o.newGroup(this.o.identity)
        return { key_package: toB64(this.mls.keyPackage()) }
      },
      {
        joined: (reply) =>
          this.run(() => {
            if (!current()) return
            this.groupId = fromB64(reply.group_id)
            if (reply.action === 'create') this.create(this.groupId)
          }),
        event: (event, payload) =>
          this.run(() => (current() ? this.handle(event, payload) : undefined)),
        refused: () => current() && this.end('failed'),
        closed: () => current() && this.end('failed'),
      },
    )
  }

  stop() {
    this.stopped = true
    this.generation += 1
    this.topic?.close()
    this.reset()
  }

  private run(step: () => void | Promise<void>) {
    this.queue = this.queue.then(step).catch(() => this.restart())
  }

  private async handle(event: string, p: Record<string, unknown>) {
    const mls = this.mls
    if (!mls || this.stopped) return
    switch (event) {
      case 'create':
        this.groupId = fromB64(p.group_id)
        return this.create(this.groupId)
      case 'welcome':
        this.groupId = fromB64(p.group_id)
        mls.join(fromB64(p.welcome), this.groupId)
        return this.newKey()
      case 'commit':
        if (p.epoch !== mls.epoch()) return this.restart()
        mls.applyCommit(fromB64(p.commit))
        return this.newKey()
      case 'commit_request':
        if (p.epoch !== mls.epoch()) return this.restart()
        return this.commit(mls, p)
      case 'reset':
        return this.restart()
      case 'superseded':
        return this.end('superseded')
      case 'removed':
        return this.end('removed')
    }
  }

  private async commit(mls: MlsGroup, p: Record<string, unknown>) {
    const userId = String(p.user_id)
    let made: MlsCommit
    try {
      made = p.op === 'add' ? mls.add(fromB64(p.key_package), userId) : mls.remove(userId)
    } catch {
      // For example a key package that is not this user's: refuse to add it.
      // The server asks someone else after a timeout.
      return
    }
    const accepted = await this.topic!.push('commit', {
      epoch: p.epoch,
      commit: toB64(made.commit),
      ...(made.welcome ? { welcome: toB64(made.welcome) } : {}),
    })
    made.free()
    if (accepted) {
      mls.mergePending()
      this.newKey()
    } else {
      mls.discardPending()
    }
  }

  private create(groupId: Uint8Array) {
    this.mls!.create(groupId)
    this.newKey()
  }

  private newKey() {
    const mls = this.mls!
    const epoch = mls.epoch()
    this.secured = true
    this.o.onKey(mls.voiceKey(), epoch)
    this.o.onStatus({
      state: 'secured',
      epoch,
      members: mls.members(),
      code: mls.verificationCode(),
    })
  }

  /** Start over with fresh keys (rejoining the topic gives a new key package). */
  private restart() {
    if (this.stopped) return
    const now = Date.now()
    this.restarts = [...this.restarts.filter((t) => now - t < RESTART_WINDOW_MS), now]
    if (this.restarts.length > MAX_RESTARTS) return this.end('failed')
    this.generation += 1
    this.topic?.close()
    this.reset()
    this.start()
  }

  private end(reason: 'removed' | 'superseded' | 'failed') {
    if (this.stopped) return
    this.stop()
    this.o.onStatus({ state: 'ended', reason })
  }

  private reset() {
    this.mls?.free()
    this.mls = undefined
    this.groupId = undefined
    this.secured = false
  }

  /** True once we hold a voice key for the current group. */
  get isSecured() {
    return this.secured
  }
}
