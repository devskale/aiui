import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractTurnWrittenFiles } from './turn-written-files.js'

test('empty / non-array input → []', () => {
  assert.deepEqual(extractTurnWrittenFiles(undefined), [])
  assert.deepEqual(extractTurnWrittenFiles(null), [])
  assert.deepEqual(extractTurnWrittenFiles([]), [])
})

test('collects paths from successful write/edit calls, in first-seen order', () => {
  const r = extractTurnWrittenFiles([
    { name: 'write', args: { path: 'index.html' }, status: 'done' },
    { name: 'edit', args: { path: 'src/app.js' }, status: 'done' },
    { name: 'edit', args: { path: 'index.html' }, status: 'done' }, // dup
  ])
  assert.deepEqual(r, [{ filePath: 'index.html' }, { filePath: 'src/app.js' }])
})

test('ignores non-file tools (bash, read, grep)', () => {
  const r = extractTurnWrittenFiles([
    { name: 'bash', args: { command: 'ls' }, status: 'done' },
    { name: 'read', args: { path: 'README.md' }, status: 'done' },
    { name: 'write', args: { path: 'out.csv' }, status: 'done' },
  ])
  assert.deepEqual(r, [{ filePath: 'out.csv' }])
})

test('ignores running / errored calls — nothing was written', () => {
  const r = extractTurnWrittenFiles([
    { name: 'write', args: { path: 'a.txt' }, status: 'running' },
    { name: 'write', args: { path: 'b.txt' }, status: 'error' },
    { name: 'write', args: { path: 'c.txt' }, status: 'done' },
  ])
  assert.deepEqual(r, [{ filePath: 'c.txt' }])
})

test('tolerates path field variants and normalizes ./ and double slashes', () => {
  const r = extractTurnWrittenFiles([
    { name: 'write', args: { file_path: './reports/x/index.html' }, status: 'done' },
    { name: 'edit', args: { filePath: 'reports//x/index.html' }, status: 'done' },
    { name: 'write', args: { filename: 'data.csv' }, status: 'done' },
  ])
  assert.deepEqual(r, [
    { filePath: 'reports/x/index.html' },
    { filePath: 'data.csv' },
  ])
})

test('skips calls with no resolvable path', () => {
  const r = extractTurnWrittenFiles([
    { name: 'write', args: {}, status: 'done' },
    { name: 'write', args: { path: '' }, status: 'done' },
    { name: 'write', args: { path: '  ' }, status: 'done' },
    { name: 'write', args: { path: 'ok.txt' }, status: 'done' },
  ])
  assert.deepEqual(r, [{ filePath: 'ok.txt' }])
})

test('handles stringified args (JSON) via the object path', () => {
  const r = extractTurnWrittenFiles([
    { name: 'write', args: JSON.stringify({ path: 'a.md' }), status: 'done' },
  ])
  // String args are not parsed (the live reducer stores objects);
  // a stringified object is treated as non-object → no path. Safe no-op.
  assert.deepEqual(r, [])
})
