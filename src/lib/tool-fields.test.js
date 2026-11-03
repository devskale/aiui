// tool-fields.test.js — All-or-Nothing-Regel: Tabelle nur bei komplett flachen Args.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { argRows } from './tool-fields.js'

test('flache Primitives → Zeilen mit String-Werten', () => {
  assert.deepEqual(argRows({ path: 'a/b.ts', line: 12, all: false, prev: null }), [
    { key: 'path', value: 'a/b.ts' },
    { key: 'line', value: '12' },
    { key: 'all', value: 'false' },
    { key: 'prev', value: 'null' },
  ])
})

test('ein einziges verschachteltes Feld reicht für den JSON-Fallback', () => {
  assert.equal(argRows({ command: 'ls', env: { FOO: 1 } }), null)
  assert.equal(argRows({ files: ['a', 'b'] }), null)
})

test('leere / kaputte Args → null (Aufrufer rendert gar nichts bzw. JSON)', () => {
  assert.equal(argRows({}), null)
  assert.equal(argRows(null), null)
  assert.equal(argRows('raw string'), null)
})
