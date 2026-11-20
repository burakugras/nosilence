// SPDX-License-Identifier: AGPL-3.0-only
// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import type { VoiceTopicHandlers } from '../gateway/types'
import { initSync, VoiceGroup } from './mls-pkg/nosilence_mls.js'
import { VoiceSession, type E2eeStatus } from './session'

// Real MLS (the WebAssembly module built from client/mls), loaded from disk.
beforeAll(() => {
  initSync({ module: readFileSync(new URL('./mls-pkg/nosilence_mls_bg.wasm', import.meta.url)) })
})

const hex = (k: Uint8Array) => Array.from(k, (b) => b.toString(16).padStart(2, '0')).join('')
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

/**
 * A minimal stand-in for the server's ordering (Nosilence.Voice.Group): first
 * device creates, the first member commits each change, commits only for the
 * current epoch.
 */
class FakeServer {
  epoch = 0
  members: string[] = []
  devices = new Map<string, VoiceTopicHandlers>()
  keyPackages = new Map<string, string>()
  pending: { op: 'add' | 'remove'; user: string } | undefined
  queue: { op: 'add' | 'remove'; user: string }[] = []
  groupId = btoa('group-1')

  openTopic = (_channel: string, params: () => object, handlers: VoiceTopicHandlers) => {
    let user = ''
    queueMicrotask(() => {
      const { key_package } = params() as { key_package: string }
      user = [...this.devices.keys()].length === 0 ? 'first' : `user${this.devices.size}`
      user = (handlers as unknown as { id: string }).id ?? user
      this.devices.set(user, handlers)
      this.keyPackages.set(user, key_package)
      if (this.members.length === 0) {
        this.members = [user]
        this.epoch = 0
        handlers.joined({ action: 'create', group_id: this.groupId })
      } else {
        handlers.joined({ action: 'wait', group_id: this.groupId })
        this.enqueue({ op: 'add', user })
      }
    })
    return {
      push: async (_event: string, p: object) => this.commit(user, p as Record<string, unknown>),
      close: () => this.leave(user),
    }
  }

  private enqueue(change: { op: 'add' | 'remove'; user: string }) {
    this.queue.push(change)
    this.dispatch()
  }

  private dispatch() {
    if (this.pending || this.queue.length === 0) return
    this.pending = this.queue.shift()!
    const committer = this.members.find((m) => m !== this.pending!.user)!
    this.devices.get(committer)!.event('commit_request', {
      epoch: this.epoch,
      op: this.pending.op,
      user_id: this.pending.user,
      key_package: this.keyPackages.get(this.pending.user),
    })
  }

  private commit(from: string, p: Record<string, unknown>) {
    if (!this.pending || p.epoch !== this.epoch) return false
    const { op, user } = this.pending
    for (const m of this.members)
      if (m !== from && m !== user)
        this.devices.get(m)!.event('commit', { epoch: this.epoch, commit: p.commit })
    this.epoch += 1
    if (op === 'add') {
      this.members.push(user)
      this.devices.get(user)!.event('welcome', {
        epoch: this.epoch,
        welcome: p.welcome,
        group_id: this.groupId,
      })
    } else {
      this.members = this.members.filter((m) => m !== user)
    }
    this.pending = undefined
    queueMicrotask(() => this.dispatch())
    return true
  }

  private leave(user: string) {
    this.devices.delete(user)
    if (!this.members.includes(user)) return
    // Like the real server: with nobody left in the group, the next device starts afresh.
    if (this.members.length === 1) {
      this.members = []
      this.pending = undefined
      this.queue = []
    } else {
      this.enqueue({ op: 'remove', user })
    }
  }
}

type Device = { session: VoiceSession; keys: string[]; status: E2eeStatus[] }

function device(server: FakeServer, id: string): Device {
  const d: Device = { keys: [], status: [], session: undefined! }
  d.session = new VoiceSession({
    channelId: 'ch1',
    identity: id,
    newGroup: (identity) => new VoiceGroup(identity),
    // Tag the handlers so the fake server knows which account this is.
    openTopic: (channel, params, handlers) =>
      server.openTopic(channel, params, Object.assign(handlers, { id })),
    onKey: (key) => d.keys.push(hex(key)),
    onStatus: (s) => d.status.push(s),
  })
  d.session.start()
  return d
}

const last = <T>(xs: T[]) => xs[xs.length - 1]

describe('VoiceSession with real MLS', () => {
  it('everyone in the call ends up with the same key and verification code', async () => {
    const server = new FakeServer()
    const a = device(server, 'alfa')
    await settle()
    const b = device(server, 'bravo')
    await settle()
    const c = device(server, 'charlie')
    await settle()

    expect(server.epoch).toBe(2)
    expect(last(a.keys)).toBe(last(b.keys))
    expect(last(b.keys)).toBe(last(c.keys))
    const status = last(c.status)
    expect(status).toMatchObject({ state: 'secured', epoch: 2 })
    expect(status.state === 'secured' && status.members).toEqual(['alfa', 'bravo', 'charlie'])
    expect(last(a.status)).toEqual(status)
    // Every change brought a new key.
    expect(new Set(a.keys).size).toBe(a.keys.length)
  })

  it('when someone leaves, the others move to a key the leaver does not have', async () => {
    const server = new FakeServer()
    const a = device(server, 'alfa')
    await settle()
    const b = device(server, 'bravo')
    await settle()
    const c = device(server, 'charlie')
    await settle()
    const leaversKey = last(c.keys)

    c.session.stop()
    await settle()

    expect(server.members).toEqual(['alfa', 'bravo'])
    expect(last(a.keys)).toBe(last(b.keys))
    expect(last(a.keys)).not.toBe(leaversKey)
    expect(last(b.status)).toMatchObject({ state: 'secured', members: ['alfa', 'bravo'] })
  })

  it('a key package that does not belong to the account is not added', async () => {
    const server = new FakeServer()
    const a = device(server, 'alfa')
    await settle()
    // The server claims this key package is bravo's, but it was made for mallory.
    const mallory = new VoiceGroup('mallory')
    server.keyPackages.set('bravo', btoa(String.fromCharCode(...mallory.keyPackage())))
    server.members.push('x')
    server.devices.get('alfa')!.event('commit_request', {
      epoch: 0,
      op: 'add',
      user_id: 'bravo',
      key_package: server.keyPackages.get('bravo'),
    })
    await settle()
    expect(server.epoch).toBe(0)
    expect(a.keys).toHaveLength(1)
  })

  it('out of step with the server, a device starts over with fresh keys', async () => {
    const server = new FakeServer()
    const a = device(server, 'alfa')
    await settle()
    const opened = a.status.length
    server.devices.get('alfa')!.event('commit', { epoch: 7, commit: btoa('x') })
    await settle()
    // It went back to "securing" and created a fresh group, with a new key.
    expect(a.status.slice(opened).map((s) => s.state)).toEqual(['securing', 'secured'])
    expect(a.keys).toHaveLength(2)
    expect(a.keys[0]).not.toBe(a.keys[1])
  })

  it('being removed ends the session', async () => {
    const server = new FakeServer()
    const a = device(server, 'alfa')
    await settle()
    server.devices.get('alfa')!.event('removed', {})
    await settle()
    expect(last(a.status)).toEqual({ state: 'ended', reason: 'removed' })
  })
})
