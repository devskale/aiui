import test from 'node:test'
import assert from 'node:assert/strict'
import { pathParts } from './path-label.js'

test('pathParts: verzeichnisse + datei, dirs enden auf /', () => {
  assert.deepEqual(pathParts('reports/fi-brantner/index.html'),
    { dirs: 'reports/fi-brantner/', file: 'index.html' })
})

test('pathParts: nur datei → dirs leer', () => {
  assert.deepEqual(pathParts('index.html'), { dirs: '', file: 'index.html' })
})

test('pathParts: trailing slash → letzte Segment ist der Name', () => {
  const r = pathParts('a/b/')
  assert.equal(r.dirs, 'a/')
  assert.equal(r.file, 'b')
})

test('pathParts: backslashes werden toleriert', () => {
  assert.deepEqual(pathParts('a\\b\\c.txt'), { dirs: 'a/b/', file: 'c.txt' })
})

test('pathParts: degeneriert wirft nicht', () => {
  assert.deepEqual(pathParts(''), { dirs: '', file: '' })
  assert.deepEqual(pathParts(null), { dirs: '', file: '' })
  assert.deepEqual(pathParts(undefined), { dirs: '', file: '' })
  assert.deepEqual(pathParts('/'), { dirs: '/', file: '' })
})
