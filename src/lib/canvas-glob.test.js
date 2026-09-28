import { test } from 'node:test'
import assert from 'node:assert/strict'
import { matchesCanvasGlob, canvasPathFromToolCall } from './canvas-glob.js'

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

// ── canvasPathFromToolCall: effektbasiert (write UND bash) ──
const G = 'reports/**/canvas.json'

test('write-Tool: Pfad aus den Args', () => {
  assert.equal(canvasPathFromToolCall(G, { name: 'write', args: { path: 'reports/fi-x/canvas.json' } }), 'reports/fi-x/canvas.json')
  assert.equal(canvasPathFromToolCall(G, { name: 'write', args: { file_path: '/srv/ws/u/reports/fi-x/canvas.json' } }), '/srv/ws/u/reports/fi-x/canvas.json')
  assert.equal(canvasPathFromToolCall(G, { name: 'write', args: { path: 'reports/fi-x/report.md' } }), null)
})

test('bash: Redirect-Ziele werden erkannt (>, heredoc, tee, cp)', () => {
  const mk = (command) => ({ name: 'bash', args: { command } })
  assert.equal(canvasPathFromToolCall(G, mk("cat << 'EOF' > reports/fi-mondi/canvas.json\n{…}\nEOF")), 'reports/fi-mondi/canvas.json')
  assert.equal(canvasPathFromToolCall(G, mk('echo x > /srv/ws/u/reports/fi-a/canvas.json')), '/srv/ws/u/reports/fi-a/canvas.json')
  assert.equal(canvasPathFromToolCall(G, mk('tee reports/fi-b/canvas.json')), 'reports/fi-b/canvas.json')
  assert.equal(canvasPathFromToolCall(G, mk('cp /tmp/c.json reports/fi-c/canvas.json')), 'reports/fi-c/canvas.json')
})

test('bash: canvas.json ohne Glob-Match oder ohne Schreibbezug → null', () => {
  const mk = (command) => ({ name: 'bash', args: { command } })
  assert.equal(canvasPathFromToolCall(G, mk('cat cache/canvas.json')), null)
  assert.equal(canvasPathFromToolCall(G, mk('ls reports/fi-x/canvas.json.bak')), null)
  assert.equal(canvasPathFromToolCall(G, mk('grep canvas.json reports/')), null)
})

test('andere Tools und kaputte Shapes → null', () => {
  assert.equal(canvasPathFromToolCall(G, { name: 'read', args: { path: 'reports/fi-x/canvas.json' } }), null)
  assert.equal(canvasPathFromToolCall(G, null), null)
  assert.equal(canvasPathFromToolCall(G, { name: 'write' }), null)
  // JSON-String-Args (Replay-Form) werden geparsed
  assert.equal(canvasPathFromToolCall(G, { name: 'write', args: JSON.stringify({ path: 'reports/fi-d/canvas.json' }) }), 'reports/fi-d/canvas.json')
})
