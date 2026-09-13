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
  fs.writeFileSync(path.join(dir, '.hidden'), 'x')

  const entries = listDir(dir, '')
  const byName = Object.fromEntries(entries.map(e => [e.name, e]))

  assert.deepEqual(entries.map(e => e.name).filter(n => n === 'sub'), ['sub'], 'dirs sort first')
  assert.ok(!byName['.hidden'], 'dotfiles hidden')
  assert.ok(!byName['node_modules'] && !byName['uploads'], 'IGNORED dirs hidden')
  assert.equal(byName['a.png'].isImage, true)
  assert.equal(byName['d.webp'].isImage, true)
  assert.equal(byName['b.txt'].isImage, false)
  // svg is NOT in the mime table (vision doesn't accept it) → not an image
  assert.equal(byName['c.svg'].isImage, false)
  assert.equal(byName['sub'].isImage, false, 'dirs are never images')
  fs.rmSync(dir, { recursive: true, force: true })
})
