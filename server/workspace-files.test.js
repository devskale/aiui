// workspace-files.test.js — workspace browsing helpers. Run: node --test server/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listDir } from './workspace-files.js'

test('listDir: marks images via the server mime table, hides noise, dirs first', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-list-'))
  for (const f of ['a.png', 'b.txt', 'c.svg', 'd.webp']) fs.writeFileSync(path.join(dir, f), 'x')
  fs.mkdirSync(path.join(dir, 'sub'))
  fs.mkdirSync(path.join(dir, 'node_modules'))
  fs.mkdirSync(path.join(dir, 'uploads'))
  fs.mkdirSync(path.join(dir, 'sessions'))
  fs.writeFileSync(path.join(dir, '.hidden'), 'x')
  fs.writeFileSync(path.join(dir, 'uploads', 'chat-upload.pdf'), 'x')

  const entries = listDir(dir, '')
  const byName = Object.fromEntries(entries.map(e => [e.name, e]))

  assert.deepEqual(entries.map(e => e.name).filter(n => n === 'sub'), ['sub'], 'dirs sort first')
  assert.ok(!byName['.hidden'], 'dotfiles hidden')
  assert.ok(!byName['node_modules'] && !byName['sessions'], 'internal dirs hidden')
  // uploads/ is LISTED (chat uploads stay visible + reusable)
  assert.ok(byName['uploads']?.dir, 'uploads dir browsable')
  assert.equal(byName['a.png'].isImage, true)
  assert.equal(byName['a.png'].contentType, 'image/png')
  assert.equal(byName['d.webp'].isImage, true)
  assert.equal(byName['b.txt'].isImage, false)
  assert.equal(byName['b.txt'].contentType, null, 'txt is download-only/text-preview')
  // svg is NOT in the mime table (vision doesn't accept it) → not an image
  assert.equal(byName['c.svg'].isImage, false)
  assert.equal(byName['c.svg'].contentType, null, 'svg stays octet-stream → inert')
  assert.equal(byName['sub'].isImage, false, 'dirs are never images')
  assert.equal(byName['sub'].contentType, null, 'dirs have no content type')
  fs.rmSync(dir, { recursive: true, force: true })
})
