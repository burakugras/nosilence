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
import { mkdirSync, writeFileSync } from 'node:fs'
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

const LIVEKIT_CONTAINER = arg('livekit-container', 'nosilence-livekit-1')
const TICK_EVERY_MS = 300

/** Degrades the LiveKit container's outgoing traffic (server to clients), or clears it. */
function netem(spec) {
  const tc = spec
    ? `tc qdisc replace dev eth0 root netem ${spec}`
    : 'tc qdisc del dev eth0 root 2>/dev/null; true'
  execFileSync('docker', [
    'run', '--rm', '--network', `container:${LIVEKIT_CONTAINER}`, '--cap-add', 'NET_ADMIN',
    'alpine:3.22', 'sh', '-c', `apk add -q iproute2-tc >/dev/null 2>&1 && ${tc}`,
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
  window.__recording = { on: false, rate: 48000, tracks: [] }
  window.__pcs = []
  const detect = (stream, sink) => {
    const ctx = new AudioContext()
    const recorded = []
    if (sink === window.__ticks.heard) window.__recording.tracks.push(recorded)
    const source = ctx.createMediaStreamSource(stream)
    const probe = ctx.createScriptProcessor(256, 1, 1)
    let last = -1e12
    probe.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0)
      if (sink === window.__ticks.heard && window.__recording.on) {
        window.__recording.rate = ctx.sampleRate
        recorded.push(new Float32Array(data))
      }
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
  const Original = window.RTCPeerConnection
  window.RTCPeerConnection = function (...args) {
    const pc = new Original(...args)
    window.__pcs.push(pc)
    pc.addEventListener('track', (e) => {
      if (e.track.kind === 'audio') detect(new MediaStream([e.track]), window.__ticks.heard)
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
    let lost = 0, received = 0, concealed = 0, samples = 0
    for (const pc of window.__pcs) {
      if (pc.connectionState === 'closed') continue
      ;(await pc.getStats()).forEach((r) => {
        if (r.type === 'inbound-rtp' && r.kind === 'audio') {
          lost += r.packetsLost || 0; received += r.packetsReceived || 0
          concealed += (r.concealedSamples || 0) - (r.silentConcealedSamples || 0)
          samples += r.totalSamplesReceived || 0
        }
      })
    }
    return { lost, received, concealed, samples }
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
async function account(name) {
  const email = `netlab-${name}-${run}@example.com`
  const password = 'netlab password, long enough'
  await api('/api/accounts', { method: 'POST', body: { email, password, display_name: name, age_confirmed: true } })
  const box = await (await fetch(`${API}/dev/mailbox/json`)).json()
  const mail = box.data.find((m) => m.to.includes(email))
  await api('/api/accounts/confirm', { method: 'POST', body: { token: /token=([\w-]+)/.exec(mail.text_body)[1] } })
  const session = await api('/api/session', { method: 'POST', body: { email, password } })
  return { name, cookie: session.setCookie.split(';')[0] }
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

async function measure(label, network, sender, community) {
  const receiverUser = await account(`rx${label.replace(/\W/g, '')}`)
  const inv = (await api(`/api/communities/${community.id}/invites`, { method: 'POST', cookie: sender.user.cookie, body: {} })).json
  await api('/api/invites/accept', { method: 'POST', cookie: receiverUser.cookie, body: { token: new URL(inv.url).searchParams.get('token') } })

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
      for (const scenario of ['signal-reconnect', 'full-reconnect']) {
        const before = (await rx.evaluate('window.__ticks.heard.length')) || 0
        const t0 = Date.now()
        await rx.evaluate((s) => window.__nosilenceRoom.simulateScenario(s), scenario)
        let back
        for (let t = 0; t < 15_000 && !back; t += 20) {
          const heardNow = await rx.evaluate('window.__ticks.heard')
          back = heardNow.slice(before).find((h) => h > t0 + 50)
          if (!back) await wait(20)
        }
        result[`${scenario}_ms`] = back ? Math.round(back - t0) : NaN
        await wait(3_000)
      }
    }
    return result
  } finally {
    netem('')
    await b.close()
  }
}

// --- Listening test ---------------------------------------------------------
async function listen(sender, community) {
  const out = join(fileURLToPath(new URL('.', import.meta.url)), 'recordings')
  mkdirSync(out, { recursive: true })
  for (const [label, network] of [
    ['clean', ''],
    ['loss-10', 'loss 10%'],
    ['loss-20', 'loss 20%'],
  ]) {
    process.stdout.write(`recording: ${label} ... `)
    const user = await account(`ear${label.replace(/\W/g, '')}`)
    const inv = (await api(`/api/communities/${community.id}/invites`, { method: 'POST', cookie: sender.user.cookie, body: {} })).json
    await api('/api/invites/accept', { method: 'POST', cookie: user.cookie, body: { token: new URL(inv.url).searchParams.get('token') } })
    const b = await browser()
    netem(network)
    try {
      const rx = await open(b, user, `${APP}/c/${community.id}`)
      await joinButton(rx).click()
      await rx.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
      await wait(2_000)
      await rx.evaluate('window.__recording.on = true')
      await wait(20_000)
      const data = await rx.evaluate('window.__recordingWav()')
      const file = join(out, `${label}.wav`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      console.log(file)
    } finally {
      netem('')
      await b.close()
    }
  }
}

// --- Run ------------------------------------------------------------------
const owner = await account('tx')
const community = (await api('/api/communities', { method: 'POST', cookie: owner.cookie, body: { name: `netlab ${run}` } })).json.community

const txBrowser = await browser()
const results = []
try {
  const page = await open(txBrowser, owner, `${APP}/c/${community.id}`)
  await joinButton(page).click()
  await page.getByText('End-to-end encrypted.').waitFor({ timeout: 20_000 })
  const sender = { user: owner, page }
  if (LISTEN) {
    await listen(sender, community)
    process.exit(0)
  }

  // netem settings for the server-to-client direction.
  const scenarios = [
    ['clean', ''],
    ['10% loss', 'loss 10%'],
    ['10% loss, 60 ms delay', 'delay 60ms 15ms distribution normal loss 10%'],
    ['20% loss', 'loss 20%'],
  ]
  for (const [label, network] of scenarios) {
    process.stdout.write(`measuring: ${label} ... `)
    const r = await measure(label, network, sender, community)
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
console.log(`${verdict(clean.join_ms < 2000)} join < 2 s: ${clean.join_ms} ms`)
console.log(`${verdict(clean.mouth_to_ear_p95_ms < 150)} mouth-to-ear p95 < 150 ms: ${clean.mouth_to_ear_p95_ms} ms (no microphone/speaker hardware delay)`)
console.log(`${verdict(clean['full-reconnect_ms'] < 3000)} reconnect < 3 s: signal ${clean['signal-reconnect_ms']} ms, full ${clean['full-reconnect_ms']} ms`)
console.log(`${verdict(loss10.ticks_heard_pct >= 95)} intelligible at 10% loss: ${loss10.ticks_heard_pct}% of ticks heard, ${loss10.concealed_pct}% concealed`)
writeFileSync(join(workdir, 'results.json'), JSON.stringify(results, null, 2))
console.log(`results: ${join(workdir, 'results.json')}`)
