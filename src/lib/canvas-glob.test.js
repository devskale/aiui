import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesCanvasGlob } from './canvas-glob.js'

test('relative path matches directly', () => {
  assert.ok(matchesCanvasGlob('reports/**/canvas.json', 'reports/fi-x-1a2b/canvas.json'))
  assert.ok(matchesCanvasGlob('reports/**/canvas.json', 'reports/fi-x-1a2b/sub/canvas.json'))
})

test('absolute workspace paths match via suffix', () => {
  assert.ok(matchesCanvasGlob(
    'reports/**/canvas.json',
    '/srv/aiui/workspace/alice-ab12cd34/reports/fi-strabag-88983h-f132/canvas.json'
  ))
})

test('wrong file or dir does not match', () => {
  assert.ok(!matchesCanvasGlob('reports/**/canvas.json', 'reports/fi-x/report.md'))
  assert.ok(!matchesCanvasGlob('reports/**/canvas.json', 'notes/canvas.json'))
  assert.ok(!matchesCanvasGlob('reports/**/canvas.json', 'reports/canvas.json.tmp'))
})

test('single * stays inside one segment', () => {
  assert.ok(matchesCanvasGlob('reports/*/canvas.json', 'reports/fi-x-1/canvas.json'))
  assert.ok(!matchesCanvasGlob('reports/*/canvas.json', 'reports/a/b/canvas.json'))
})

test('plain filename glob', () => {
  assert.ok(matchesCanvasGlob('canvas.json', 'workspace/u/canvas.json'))
  assert.ok(!matchesCanvasGlob('canvas.json', 'workspace/u/other.json'))
})

test('guards: empty / wrong types → false', () => {
  assert.ok(!matchesCanvasGlob(null, 'x'))
  assert.ok(!matchesCanvasGlob('reports/**/canvas.json', ''))
  assert.ok(!matchesCanvasGlob('', 'reports/canvas.json'))
})
