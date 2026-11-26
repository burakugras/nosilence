// SPDX-License-Identifier: AGPL-3.0-only
// Checks that an update file's signature (the `.sig` written by `tauri build`) was made
// by the key whose public half is in desktop/tauri.conf.json. Installed apps run the
// same check before they accept an update, so a release whose signing secret does not
// match the public key would be refused by every installed app: this catches that
// before the release is published.
//
// Usage: node tools/verify-update-signature.mjs <file> <file.sig> [tauri.conf.json]
//
// Both the key and the signature are minisign files, base64-encoded once more by Tauri.
// Key line: "Ed" + key id (8 bytes) + Ed25519 public key (32 bytes).
// Signature line: "ED" (the file is hashed with BLAKE2b-512 first) or "Ed" + key id
// (8 bytes) + signature (64 bytes); then a trusted comment and a global signature over
// the signature and that comment.
import { createHash, createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'

const [file, sigFile, confFile = 'desktop/tauri.conf.json'] = process.argv.slice(2)
if (!file || !sigFile) {
  console.error('Usage: node tools/verify-update-signature.mjs <file> <file.sig> [tauri.conf.json]')
  process.exit(2)
}

const unwrap = (text) =>
  Buffer.from(text.trim(), 'base64')
    .toString('utf8')
    .split(/\r?\n/)
    .filter((line) => line.length > 0)

function fail(message) {
  console.error(`Update signature check failed: ${message}`)
  process.exit(1)
}

// Ed25519 public key in DER (SPKI) form, the shape node:crypto takes.
const ed25519Key = (raw) =>
  createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  })

const conf = JSON.parse(readFileSync(confFile, 'utf8'))
const keyLines = unwrap(conf.plugins?.updater?.pubkey ?? '')
const keyBytes = Buffer.from(keyLines[1] ?? '', 'base64')
if (keyBytes.length !== 42 || keyBytes.subarray(0, 2).toString() !== 'Ed') {
  fail(`no Ed25519 public key in ${confFile}`)
}
const keyId = keyBytes.subarray(2, 10)
const publicKey = ed25519Key(keyBytes.subarray(10))

const sigLines = unwrap(readFileSync(sigFile, 'utf8'))
const sigBytes = Buffer.from(sigLines[1] ?? '', 'base64')
const trusted = sigLines[2] ?? ''
const globalSig = Buffer.from(sigLines[3] ?? '', 'base64')
if (sigBytes.length !== 74 || !trusted.startsWith('trusted comment: ') || globalSig.length !== 64) {
  fail(`${sigFile} is not a minisign signature`)
}

const algorithm = sigBytes.subarray(0, 2).toString()
const sigKeyId = sigBytes.subarray(2, 10)
const signature = sigBytes.subarray(10)
if (!sigKeyId.equals(keyId)) {
  const hex = (b) => Buffer.from(b).reverse().toString('hex').toUpperCase()
  fail(`signed with key ${hex(sigKeyId)}, but the app trusts key ${hex(keyId)}`)
}

const content = readFileSync(file)
let message
if (algorithm === 'ED') message = createHash('blake2b512').update(content).digest()
else if (algorithm === 'Ed') message = content
else fail(`unknown signature algorithm ${algorithm}`)

if (!verify(null, message, publicKey, signature)) fail(`the signature does not match ${file}`)
const comment = Buffer.from(trusted.slice('trusted comment: '.length), 'utf8')
if (!verify(null, Buffer.concat([signature, comment]), publicKey, globalSig)) {
  fail('the trusted comment was changed')
}
console.log(
  `Update signature OK: ${file} (key ${Buffer.from(keyId).reverse().toString('hex').toUpperCase()})`,
)
