#!/usr/bin/env node
// scripts/hash-passphrase.js <passphrase>
// Prints a "salt:hash" (scrypt, hex) to paste into ~/.aiui-auth.json passphrases[].
//   AIUI_AUTH_FILE=... node scripts/hash-passphrase.js 'my secret'
import crypto from 'node:crypto'

const pw = process.argv[2]
if (!pw) {
  console.error('usage: node scripts/hash-passphrase.js <passphrase>')
  process.exit(1)
}
const salt = crypto.randomBytes(16)
const hash = crypto.scryptSync(pw, salt, 32)
console.log(`${salt.toString('hex')}:${hash.toString('hex')}`)
