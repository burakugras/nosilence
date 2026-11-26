// SPDX-License-Identifier: AGPL-3.0-only
//
// netlab: measures Nosilence voice against the phase 7 targets (ADR 0011).
//
//   join < 2 s · mouth-to-ear p95 < 150 ms · reconnect < 3 s ·
//   intelligible speech at 10% packet loss
//
// Two Chrome instances join one end-to-end encrypted voice channel. The
// sender's microphone is a file of short ticks; both pages note when each tick
// is captured and when it is heard, on the same machine clock. The network is
// degraded with Linux netem on the LiveKit container (a short-lived helper
// container shares its network and needs NET_ADMIN; no Windows admin rights).
// Chrome's own WebRTC network emulation field trials are ignored by release
// builds, so they cannot be used.
//
// Needs the development stack running (Docker services, Phoenix on :4000,
// Vite on :5173), Docker and Google Chrome. Usage:
//
//   cd tools/netlab; npm install; npm run measure
//   options: --app http://127.0.0.1:5173  --chrome "<path to chrome.exe>"  --headful
//
// `--listen` instead records what the receiver hears of spoken sentences
// (Windows text-to-speech) on a clean network and with 10% and 20% loss, as
// WAV files in tools/netlab/recordings, to judge intelligibility by ear.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const APP = arg('app', 'http://127.0.0.1:5173')
const API = arg('api', 'http://127.0.0.1:4000')
const CHROME = arg('chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe')
const HEADLESS = !process.argv.includes('--headful')
const LISTEN = process.argv.includes('--listen')
const TRACE = process.argv.includes('--trace')
const PTT = process.argv.includes('--ptt')
const REJOIN = process.argv.includes('--rejoin')
const STAY = process.argv.includes('--stay')
const SOCIAL = process.argv.includes('--social')
const ONLY = arg('only', '') ? arg('only', '').split(',') : null
// How many times each reconnect is measured (median and p95 reported).
const RECONNECTS = Number(arg('reconnects', '5'))

const LIVEKIT_CONTAINER = arg('livekit-container', 'nosilence-livekit-1')
const TICK_EVERY_MS = 300

/**
 * Degrades the LiveKit container's traffic, or clears it. A netem spec affects
 * server to client; `uplink-loss <percent>` drops that share of the UDP packets
 * clients send to the server (iptables), as a lossy sender connection would.
 */
function netem(spec) {
  const uplink = /^uplink-loss (\d+)$/.exec(spec)
  const cmd = uplink
    ? `iptables -I INPUT -p udp -m statistic --mode random --probability ${Number(uplink[1]) / 100} -j DROP`
    : spec
      ? `tc qdisc replace dev eth0 root netem ${spec}`
      : 'tc qdisc del dev eth0 root 2>/dev/null; iptables -F INPUT 2>/dev/null; true'
  execFileSync('docker', [
    'run', '--rm', '--network', `container:${LIVEKIT_CONTAINER}`, '--cap-add', 'NET_ADMIN',
    'alpine:3.22', 'sh', '-c', `apk add -q iproute2-tc iptables >/dev/null 2>&1 && ${cmd}`,
  ])
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const quantile = (xs, q) => {
  if (!xs.length) return NaN
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]
}

// --- The sender's "microphone": 1 kHz ticks, 30 ms long, every 300 ms -----
function tickWav(path, seconds = 120) {
  const rate = 48_000
  const samples = new Int16Array(rate * seconds)
  const tick = Math.round(0.03 * rate)
  for (let start = 0; start < samples.length; start += Math.round((TICK_EVERY_MS / 1000) * rate))
    for (let i = 0; i < tick && start + i < samples.length; i++)
      samples[start + i] = Math.round(Math.sin((2 * Math.PI * 1000 * i) / rate) * 0.8 * 32767)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples.byteLength, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(rate, 24)
  header.writeUInt32LE(rate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples.byteLength, 40)
  writeFileSync(path, Buffer.concat([header, Buffer.from(samples.buffer)]))
}

// --- Injected into every page: tick detection and WebRTC stats ------------
const PROBE = `
  window.__ticks = { captured: [], heard: [] }
  // Recorded per incoming track: a connection can carry several, mostly silent.
  // Recording runs in an AudioWorklet (the audio thread): a ScriptProcessor on the
  // main thread drops or repeats blocks when busy, which sounds like crackling.
  window.__recording = { rate: 48000, tracks: [], nodes: [] }
  const RECORDER = URL.createObjectURL(new Blob([\`
    registerProcessor('recorder', class extends AudioWorkletProcessor {
      constructor() { super(); this.on = false; this.port.onmessage = (e) => { this.on = e.data } }
      process(inputs) {
        const channel = inputs[0] && inputs[0][0]
        if (this.on && channel) this.port.postMessage(channel.slice(0))
        return true
      }
    })
  \`], { type: 'application/javascript' }))
  window.__recordingStart = () => window.__recording.nodes.forEach((n) => n.port.postMessage(true))
  window.__pcs = []
  const detect = (stream, sink) => {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    if (sink === window.__ticks.heard) {
      const recorded = []
      window.__recording.tracks.push(recorded)
      window.__recording.rate = ctx.sampleRate
      ctx.audioWorklet.addModule(RECORDER).then(() => {
        const node = new AudioWorkletNode(ctx, 'recorder')
        node.port.onmessage = (e) => recorded.push(e.data)
        source.connect(node)
        const silent = ctx.createGain(); silent.gain.value = 0
        node.connect(silent); silent.connect(ctx.destination)
        window.__recording.nodes.push(node)
      })
    }
    const probe = ctx.createScriptProcessor(256, 1, 1)
    let last = -1e12
    probe.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0)
      let peak = 0
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
      const now = performance.timeOrigin + performance.now()
      if (peak > 0.05 && now - last > ${TICK_EVERY_MS * 0.7}) { sink.push(now); last = now }
    }
    source.connect(probe)
    const mute = ctx.createGain(); mute.gain.value = 0
    probe.connect(mute); mute.connect(ctx.destination)
  }
  const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await gum(constraints)
    if (stream.getAudioTracks().length) detect(new MediaStream(stream.getAudioTracks()), window.__ticks.captured)
    return stream
  }
  const detected = new WeakSet()
  const Original = window.RTCPeerConnection
  window.RTCPeerConnection = function (...args) {
    const pc = new Original(...args)
    window.__pcs.push(pc)
    pc.addEventListener('track', (e) => {
      // A reused transceiver fires 'track' again for the same track: listen once.
      if (e.track.kind !== 'audio' || detected.has(e.track)) return
      detected.add(e.track)
      detect(new MediaStream([e.track]), window.__ticks.heard)
    })
    return pc
  }
  window.RTCPeerConnection.prototype = Original.prototype
  Object.setPrototypeOf(window.RTCPeerConnection, Original)
  // What was heard while recording, as 16-bit mono WAV in base64.
  window.__recordingWav = () => {
    const { tracks, rate } = window.__recording
    // The loudest track is the one that carries the other person's voice.
    const energy = (cs) => cs.reduce((a, c) => a + c.reduce((b, x) => b + x * x, 0), 0)
    const chunks = tracks.reduce((best, t) => (energy(t) > energy(best) ? t : best), [])
    const n = chunks.reduce((a, c) => a + c.length, 0)
    const buf = new DataView(new ArrayBuffer(44 + n * 2))
    const str = (o, t) => [...t].forEach((ch, i) => buf.setUint8(o + i, ch.charCodeAt(0)))
    str(0, 'RIFF'); buf.setUint32(4, 36 + n * 2, true); str(8, 'WAVEfmt ')
    buf.setUint32(16, 16, true); buf.setUint16(20, 1, true); buf.setUint16(22, 1, true)
    buf.setUint32(24, rate, true); buf.setUint32(28, rate * 2, true)
    buf.setUint16(32, 2, true); buf.setUint16(34, 16, true); str(36, 'data'); buf.setUint32(40, n * 2, true)
    let o = 44
    for (const c of chunks) for (const x of c) { buf.setInt16(o, Math.max(-1, Math.min(1, x)) * 32767, true); o += 2 }
    let bin = ''
    const bytes = new Uint8Array(buf.buffer)
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  }
  window.__inbound = async () => {
    let lost = 0, received = 0, concealed = 0, samples = 0, nacks = 0
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue
      ;(await pc.getStats()).forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          lost += r.packetsLost || 0; received += r.packetsReceived || 0
          concealed += (r.concealedSamples || 0) - (r.silentConcealedSamples || 0)
          samples += r.totalSamplesReceived || 0
          nacks += r.nackCount || 0
        }
      })
    }
    const sdp = window.__pcs.map((pc) => pc.remoteDescription?.sdp || '').join(' ')
    const opus = (/a=rtpmap:([0-9]+) opus/i.exec(sdp) || [])[1]
    const audioNack = !!opus && sdp.includes('a=rtcp-fb:' + opus + ' nack')
    const opusLines = sdp.split(String.fromCharCode(10)).filter((l) => opus && l.includes(':' + opus + ' ')).join(' | ')
    return { lost, received, concealed, samples, nacks, audioNack, opusLines }
  }
`

// --- Accounts through the API (development mailbox for confirmation) -------
const run = Date.now()
async function api(path, { method = 'GET', body, cookie } = {}) {
  const r = await fetch(APP + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  })
  const text = await r.text()
  return { status: r.status, json: text ? JSON.parse(text) : null, setCookie: r.headers.get('set-cookie') }
}
// Two test accounts and a community, created once and reused (state.json, ignored
// by Git): creating accounts sends confirmation emails, which are rate limited.
const STATE = fileURLToPath(new URL('./state.json', import.meta.url))
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {}
const saveState = () => writeFileSync(STATE, JSON.stringify(state, null, 2))

async function account(name) {
  let creds = state[name]
  if (!creds) {
    creds = { email: `netlab-${name}-${run}@example.com`, password: 'netlab password, long enough' }
    const reg = await api('/api/accounts', {
      method: 'POST',
      body: { ...creds, display_name: name, age_confirmed: true },
    })
    if (reg.status !== 201) throw new Error(`could not create ${name}: ${JSON.stringify(reg.json)}`)
    const box = await (await fetch(`${API}/dev/mailbox/json`)).json()
    const mail = box.data.find((m) => m.to.includes(creds.email))
    await api('/api/accounts/confirm', { method: 'POST', body: { token: /token=([\w-]+)/.exec(mail.text_body)[1] } })
    state[name] = creds
    saveState()
  }
  const session = await api('/api/session', { method: 'POST', body: creds })
  if (session.status !== 200) throw new Error(`could not sign in ${name}: ${JSON.stringify(session.json)}`)
  const cookie = session.setCookie.split(';')[0]
  // Signed-in users pick a username first (ADR 0015); test accounts get one here.
  if (!session.json.user.username) {
    const username = `nl_${name}_${creds.email.split('@')[0].split('-').pop()}`.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 32)
    const set = await api('/api/me/username', { method: 'PUT', body: { username }, cookie })
    if (set.status !== 200) throw new Error(`could not set a username for ${name}: ${JSON.stringify(set.json)}`)
  }
  return { name, cookie }
}

/** The shared community, with `receiver` as a member. */
async function testCommunity(owner, receiver) {
  if (state.communityId) {
    const found = await api(`/api/communities/${state.communityId}`, { cookie: owner.cookie })
    if (found.status === 200) return found.json.community
  }
  const community = (await api('/api/communities', { method: 'POST', cookie: owner.cookie, body: { name: 'netlab' } })).json.community
  const inv = (await api(`/api/communities/${community.id}/invites`, { method: 'POST', cookie: owner.cookie, body: {} })).json
  await api('/api/invites/accept', { method: 'POST', cookie: receiver.cookie, body: { token: new URL(inv.url).searchParams.get('token') } })
  state.communityId = community.id
  saveState()
  return community
}

// --- Browsers -------------------------------------------------------------
const workdir = join(tmpdir(), `netlab-${run}`)
mkdirSync(workdir, { recursive: true })
// Harvard sentences (IEEE 1969), the usual material for speech-quality tests.
const SENTENCES = [
  'The birch canoe slid on the smooth planks.',
  'Glue the sheet to the dark blue background.',
  'It is easy to tell the depth of a well.',
  'These days a chicken leg is a rare dish.',
  'Rice is often served in round bowls.',
  'The juice of lemons makes fine punch.',
]

/** Spoken sentences from Windows text-to-speech, 48 kHz mono WAV. */
function speechWav(path) {
  const text = SENTENCES.join(' ').replace(/'/g, "''")
  execFileSync('powershell', [
    '-NoProfile', '-Command',
    'Add-Type -AssemblyName System.Speech; ' +
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
      '$f = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(48000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono); ' +
      `$s.SetOutputToWaveFile('${path}', $f); $s.Rate = -1; $s.Speak('${text}'); $s.Dispose()`,
  ])
}

const wav = join(workdir, LISTEN ? 'speech.wav' : 'ticks.wav')
if (LISTEN) speechWav(wav)
else tickWav(wav)

async function browser() {
  const args = [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${wav}`,
    '--autoplay-policy=no-user-gesture-required',
  ]
  return chromium.launch({ executablePath: CHROME, headless: HEADLESS, args })
}

async function open(b, user, url) {
  const ctx = await b.newContext({ permissions: ['microphone'] })
  const i = user.cookie.indexOf('=')
  await ctx.addCookies([{ name: user.cookie.slice(0, i), value: user.cookie.slice(i + 1), domain: '127.0.0.1', path: '/' }])
  await ctx.addInitScript(PROBE)
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[${user.name}] page error:`, e.message))
  await page.goto(url)
  return page
}

const joinButton = (page) =>
  page.getByRole('list', { name: 'Voice channels' }).getByRole('button', { name: 'Join' })

/** Pairs each heard tick with the capture it came from; returns delays in ms. */
function delays(captured, heard, from, to) {
  const out = []
  for (const h of heard) {
    if (h < from || h > to) continue
    const c = captured.filter((t) => t <= h && h - t < TICK_EVERY_MS * 0.9).pop()
    if (c !== undefined) out.push(h - c)
  }
  return out
}

async function measure(label, network, sender, community, receiverUser) {

  const b = await browser()
  netem(network)
  try {
    const rx = await open(b, receiverUser, `${APP}/c/${community.id}`)
    await joinButton(rx).waitFor()

    // Join: from pressing Join to hearing the first tick from the other side.
    const pressed = Date.now()
    await joinButton(rx).click()
    let firstHeard
    for (let t = 0; t < 10_000 && !firstHeard; t += 20) {
      firstHeard = (await rx.evaluate('window.__ticks.heard[0]')) ?? undefined
      if (!firstHeard) await wait(20)
    }
    const joinMs = firstHeard ? Math.round(firstHeard - pressed) : NaN

    // Steady state: 15 s of ticks.
    await wait(2_000)
    const s0 = await rx.evaluate('window.__inbound()')
    const from = Date.now()
    await wait(15_000)
    const to = Date.now()
    const s1 = await rx.evaluate('window.__inbound()')
    const captured = await sender.page.evaluate('window.__ticks.captured')
    const heard = await rx.evaluate('window.__ticks.heard')
    const d = delays(captured, heard, from, to)
    const sent = captured.filter((t) => t >= from - 200 && t <= to - 400).length

    const lost = s1.lost - s0.lost
    const received = s1.received - s0.received
    const result = {
      scenario: label,
      network: network || 'none',
      join_ms: joinMs,
      mouth_to_ear_p50_ms: Math.round(quantile(d, 0.5)),
      mouth_to_ear_p95_ms: Math.round(quantile(d, 0.95)),
      ticks_heard_pct: sent ? Math.round((d.length / sent) * 1000) / 10 : NaN,
      packet_loss_pct: Math.round((lost / Math.max(1, lost + received)) * 1000) / 10,
      concealed_pct: Math.round(((s1.concealed - s0.concealed) / Math.max(1, s1.samples - s0.samples)) * 1000) / 10,
    }

    // Reconnect: LiveKit drops and rebuilds the receiver's connection; how long
    // until ticks are heard again (includes up to one tick spacing, 300 ms).
    if (label === 'clean') {
      // Room events on the receiver: a run only counts if LiveKit really started
      // reconnecting (simulateScenario is sometimes ignored right after a
      // reconnect, and the next tick would then look like a fast reconnect).
      await rx.evaluate(() => {
        const room = window.__nosilenceRoom
        window.__trace = []
        for (const e of ['reconnecting', 'signalReconnecting', 'reconnected', 'trackSubscribed'])
          room.on(e, () => window.__trace.push([e, Date.now()]))
      })
      for (const scenario of ['signal-reconnect', 'full-reconnect']) {
        const times = []
        for (let attempt = 0; times.length < RECONNECTS && attempt < RECONNECTS * 3; attempt++) {
          await rx.evaluate('window.__trace.length = 0')
          const before = (await rx.evaluate('window.__ticks.heard.length')) || 0
          const t0 = Date.now()
          await rx.evaluate((s) => window.__nosilenceRoom.simulateScenario(s), scenario)
          // Sound back: the first tick heard after LiveKit started reconnecting.
          let back, trace, started
          for (let t = 0; t < 15_000 && !back; t += 20) {
            trace = await rx.evaluate('window.__trace')
            started = trace.find(([e]) => e === 'reconnecting' || e === 'signalReconnecting')
            if (started || t > 1_000) {
              const heardNow = await rx.evaluate('window.__ticks.heard')
              back = heardNow.slice(before).find((h) => h > Math.max(t0 + 50, started?.[1] ?? 0))
            }
            if (!back) await wait(20)
          }
          if (TRACE)
            console.log(`
${scenario}: ` + trace.map(([n, t]) => `${n}@${t - t0}`).join(' ') + ` heard@${back ? Math.round(back - t0) : '-'}`)
          if (started) times.push(back ? Math.round(back - t0) : 15_000)
          await wait(3_000)
        }
        result[`${scenario}_p50_ms`] = quantile(times, 0.5)
        result[`${scenario}_p95_ms`] = quantile(times, 0.95)
        result[`${scenario}_all_ms`] = times.join(' ')
      }
    }
    return result
  } finally {
    netem('')
    await b.close()
  }
}

// --- Listening test ---------------------------------------------------------
/**
 * Friends and a direct message (ADR 0015): the receiver writes from the friends
 * page; the sender sees the unread badge and the message live.
 */
async function socialCheck(sender, user) {
  const me = async (u) => (await api('/api/me', { cookie: u.cookie })).json.user
  const tx = await me(sender.user)
  const rx = await me(user)
  await api('/api/friends', { method: 'POST', body: { user_id: tx.id }, cookie: user.cookie })
  await api(`/api/friends/${rx.id}/accept`, { method: 'POST', cookie: sender.user.cookie })

  const b = await browser()
  try {
    const page = await open(b, user, `${APP}/friends`)
    const friends = page.getByRole('list', { name: /^Friends \(/ })
    await friends.getByText(tx.display_name, { exact: false }).waitFor({ timeout: 10_000 })
    await friends.getByRole('listitem').filter({ hasText: `@${tx.username}` }).getByRole('button', { name: 'Message' }).click()
    const box = page.getByRole('textbox', { name: /^Message / })
    await box.waitFor({ timeout: 10_000 })
    const text = `netlab dm ${Date.now()}`
    await box.fill(text)
    await box.press('Enter')

    const tab = sender.page
    const badge = tab.getByRole('link', { name: /^Messages/ }).getByLabel(/unread/)
    let badgeSeen = false
    try {
      await badge.waitFor({ timeout: 5_000 })
      badgeSeen = true
    } catch {}
    await tab.getByRole('link', { name: /^Messages/ }).click()
    await tab.getByRole('link', { name: rx.display_name }).click()
    let shown = false
    try {
      await tab.getByText(text).waitFor({ timeout: 5_000 })
      shown = true
    } catch {}
    const notice = await tab.getByText(/not end-to-end encrypted/).count()
    console.log(
      `${badgeSeen && shown && notice > 0 ? 'PASS' : 'FAIL'} direct message: unread badge ${badgeSeen ? 'shown' : 'missing'}, ` +
        `message ${shown ? 'shown' : 'missing'}, "not end-to-end encrypted" notice ${notice > 0 ? 'shown' : 'missing'}`,
    )
  } finally {
    await b.close()
  }
}

/** Opening other pages keeps the call: still heard, still shown in the channel. */
async function stayInCallCheck(sender, community, user) {
  const b = await browser()
  try {
    const rx = await open(b, user, `${APP}/c/${community.id}`)
    await joinButton(rx).click()
    await rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
    for (const [label, link] of [['settings', 'Settings'], ['account', user.name]]) {
      await rx.getByRole('link', { name: link, exact: true }).click()
      await wait(1_000)
      const before = await rx.evaluate('window.__ticks.heard.length')
      await wait(3_000)
      const heard = (await rx.evaluate('window.__ticks.heard.length')) - before
      const shown = await sender.page
        .getByRole('list', { name: 'Voice channels' })
        .getByText(user.name)
        .count()
      console.log(
        `${heard >= 8 && shown > 0 ? 'PASS' : 'FAIL'} on ${label}: ${heard} ticks in 3 s, ` +
          `${shown > 0 ? 'still' : 'not'} shown in the voice channel to the other person`,
      )
    }
  } finally {
    await b.close()
  }
}

/** Leave and join again, twice: the call must be encrypted and audible each time. */
async function rejoinCheck(sender, community, user) {
  const b = await browser()
  try {
    const rx = await open(b, user, `${APP}/c/${community.id}`)
    rx.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(`[rx ${m.type()}]`, m.text().slice(0, 300)))
    if (arg('rejoin-who', 'second') === 'first') {
      // The first member (who started the MLS group) leaves and joins again.
      await joinButton(rx).click()
      await rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
      const tx = sender.page
      tx.on('console', (m) => m.type() === 'error' && console.log('[tx error]', m.text().slice(0, 300)))
      for (let round = 1; round <= 3; round++) {
        await tx.locator('.voice-room').getByRole('button', { name: 'Leave', exact: true }).click()
        await wait(1_000)
        await joinButton(tx).click()
        const outcome = await Promise.race([
          tx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 }).then(() => 'encrypted'),
          tx.getByText(/could not be encrypted/).waitFor({ timeout: 20_000 }).then(() => 'failed'),
        ]).catch(() => 'timeout')
        const before = await rx.evaluate('window.__ticks.heard.length')
        await wait(2_000)
        const heard = (await rx.evaluate('window.__ticks.heard.length')) - before
        console.log(`${outcome === 'encrypted' && heard > 3 ? 'PASS' : 'FAIL'} first member rejoin ${round}: ${outcome}, ${heard} ticks in 2 s`)
      }
      return
    }
    for (let round = 1; round <= 3; round++) {
      await joinButton(rx).click()
      const outcome = await Promise.race([
        rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 }).then(() => 'encrypted'),
        rx.getByText(/could not be encrypted/).waitFor({ timeout: 20_000 }).then(() => 'failed'),
      ]).catch(() => 'timeout')
      const before = await rx.evaluate('window.__ticks.heard.length')
      await wait(2_000)
      const heard = (await rx.evaluate('window.__ticks.heard.length')) - before
      console.log(`${outcome === 'encrypted' && heard > 3 ? 'PASS' : 'FAIL'} join ${round}: ${outcome}, ${heard} ticks in 2 s`)
      await rx.locator('.voice-room').getByRole('button', { name: 'Leave', exact: true }).click()
      await wait(1_000)
    }
  } finally {
    await b.close()
  }
}

/** Push-to-talk: nothing is heard before the keys are held, or after release. */
async function pushToTalkCheck(sender, community, user) {
  const b = await browser()
  try {
    const rx = await open(b, user, `${APP}/c/${community.id}`)
    await joinButton(rx).click()
    await rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
    const heard = () => rx.evaluate('window.__ticks.heard.length')
    await wait(3_000)
    const before = await heard()
    await sender.page.keyboard.down('Control')
    await sender.page.keyboard.down('Shift')
    await wait(3_000)
    const held = (await heard()) - before
    await sender.page.keyboard.up('Shift')
    await sender.page.keyboard.up('Control')
    await wait(1_000)
    const released = await heard()
    await wait(3_000)
    const after = (await heard()) - released
    const ok = before === 0 && held >= 5 && after === 0
    console.log(
      `${ok ? 'PASS' : 'FAIL'} push-to-talk: ${before} ticks heard before pressing, ` +
        `${held} while holding Ctrl + Shift for 3 s, ${after} in 3 s after releasing`,
    )
  } finally {
    await b.close()
  }
}

async function listen(sender, community, user) {
  const out = join(fileURLToPath(new URL('.', import.meta.url)), 'recordings')
  mkdirSync(out, { recursive: true })
  for (const [label, network] of [
    ['clean', ''],
    ['loss-10', 'loss 10%'],
    ['loss-20', 'loss 20%'],
    ['uplink-loss-10', 'uplink-loss 10'],
  ].filter(([label]) => !ONLY || ONLY.includes(label))) {
    process.stdout.write(`recording: ${label} ... `)
    const b = await browser()
    netem(network)
    try {
      const rx = await open(b, user, `${APP}/c/${community.id}`)
      await joinButton(rx).click()
      await rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
      await wait(2_000)
      const s0 = await rx.evaluate('window.__inbound()')
      await rx.evaluate('window.__recordingStart()')
      await wait(20_000)
      const data = await rx.evaluate('window.__recordingWav()')
      const s1 = await rx.evaluate('window.__inbound()')
      const file = join(out, `${label}.wav`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      const lost = s1.lost - s0.lost
      const pct = (a, b) => Math.round((a / Math.max(1, b)) * 1000) / 10
      console.log(
        `${file} (loss ${pct(lost, lost + s1.received - s0.received)}%, ` +
          `concealed ${pct(s1.concealed - s0.concealed, s1.samples - s0.samples)}%, ` +
          `NACKs sent ${s1.nacks - s0.nacks}, audio NACK negotiated ${s1.audioNack})
  ${s1.opusLines}`,
      )
    } finally {
      netem('')
      await b.close()
    }
  }
}

// --- Run ------------------------------------------------------------------
const owner = await account('tx')
const receiver = await account('rx')
const community = await testCommunity(owner, receiver)

const txBrowser = await browser()
const results = []
try {
  const page = await open(txBrowser, owner, `${APP}/c/${community.id}`)
  if (PTT) {
    // The sender talks with push-to-talk, Ctrl + Shift (ADR 0013).
    await page.evaluate(() =>
      localStorage.setItem(
        'nosilence.voice-settings',
        JSON.stringify({ mode: 'push', pushKeys: ['Ctrl', 'Shift'] }),
      ),
    )
    await page.reload()
  }
  await joinButton(page).click()
  await page.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
  const sender = { user: owner, page }
  if (LISTEN) {
    await listen(sender, community, receiver)
    process.exit(0)
  }
  if (PTT) {
    await pushToTalkCheck(sender, community, receiver)
    process.exit(0)
  }
  if (process.argv.includes('--settings-shot')) {
    // A picture of the voice settings in push-to-talk mode, for checking the layout.
    await page.goto(`${APP}/settings`)
    await page.getByRole('radio', { name: /Push to talk/ }).click()
    const file = join(fileURLToPath(new URL('.', import.meta.url)), 'recordings', 'settings.png')
    await page.screenshot({ path: file, fullPage: true })
    console.log(file)
    process.exit(0)
  }
  if (REJOIN) {
    await rejoinCheck(sender, community, receiver)
    process.exit(0)
  }
  if (STAY) {
    await stayInCallCheck(sender, community, receiver)
    process.exit(0)
  }
  if (SOCIAL) {
    await socialCheck(sender, receiver)
    process.exit(0)
  }

  // netem settings for the server-to-client direction.
  const scenarios = [
    ['clean', ''],
    ['10% loss', 'loss 10%'],
    ['10% loss, 60 ms delay', 'delay 60ms 15ms distribution normal loss 10%'],
    ['20% loss', 'loss 20%'],
    ['10% uplink loss', 'uplink-loss 10'],
  ].filter(([label]) => !ONLY || ONLY.includes(label))
  for (const [label, network] of scenarios) {
    process.stdout.write(`measuring: ${label} ... `)
    const r = await measure(label, network, sender, community, receiver)
    results.push(r)
    console.log('done')
  }
} finally {
  netem('')
  await txBrowser.close()
}

console.table(results)
const verdict = (ok) => (ok ? 'PASS' : 'FAIL')
const clean = results.find((r) => r.scenario === 'clean')
const loss10 = results.find((r) => r.scenario === '10% loss')
// Verdicts for the scenarios that ran (`--only` may skip some).
if (clean) {
  console.log(`${verdict(clean.join_ms < 2000)} join < 2 s: ${clean.join_ms} ms`)
  console.log(`${verdict(clean.mouth_to_ear_p95_ms < 150)} mouth-to-ear p95 < 150 ms: ${clean.mouth_to_ear_p95_ms} ms (no microphone/speaker hardware delay)`)
  console.log(
    `${verdict(clean['full-reconnect_p95_ms'] < 3000)} reconnect < 3 s (p95 of ${RECONNECTS}): ` +
      `signal ${clean['signal-reconnect_p95_ms']} ms, full ${clean['full-reconnect_p95_ms']} ms ` +
      `(full, each run: ${clean['full-reconnect_all_ms']} ms)`,
  )
}
if (loss10) {
  // Ticks are not speech: Opus FEC protects speech (SILK), so the share of
  // invented audio here is higher than in the listening test (--listen).
  console.log(`${verdict(loss10.ticks_heard_pct >= 95)} intelligible at 10% loss: ${loss10.ticks_heard_pct}% of ticks heard, ${loss10.concealed_pct}% concealed`)
}
writeFileSync(join(workdir, 'results.json'), JSON.stringify(results, null, 2))
console.log(`results: ${join(workdir, 'results.json')}`)
