import test from 'node:test'
import assert from 'node:assert/strict'
import { previewKind, isToggleable } from './preview-kind.js'

test('previewKind: markdown nach Extension', () => {
  assert.equal(previewKind({ name: 'report.md' }), 'markdown')
  assert.equal(previewKind({ name: 'NOTES.MARKDOWN' }), 'markdown')
})

test('previewKind: html/svg → html (iframe-Preview)', () => {
  assert.equal(previewKind({ name: 'index.html' }), 'html')
  assert.equal(previewKind({ name: 'chart.svg' }), 'html')
  assert.equal(previewKind({ name: 'x.htm', contentType: null }), 'html')
})

test('previewKind: Bilder — Flag, Extension ODER Content-Type', () => {
  assert.equal(previewKind({ name: 'a.png', isImage: true }), 'image')
  assert.equal(previewKind({ name: 'photo.jpeg' }), 'image')
  assert.equal(previewKind({ name: 'odd.bin', contentType: 'image/webp' }), 'image')
})

test('previewKind: pdf über Content-Type, gewinnt gegen Namen', () => {
  assert.equal(previewKind({ name: 'x.pdf', contentType: 'application/pdf' }), 'pdf')
  assert.equal(previewKind({ name: 'x.md', contentType: 'application/pdf' }), 'pdf')
})

test('previewKind: html-Content-Type ohne Extension', () => {
  assert.equal(previewKind({ name: 'noext', contentType: 'text/html' }), 'html')
})

test('previewKind: alles andere → text', () => {
  assert.equal(previewKind({ name: 'script.js' }), 'text')
  assert.equal(previewKind({ name: 'data.json' }), 'text')
  assert.equal(previewKind({}), 'text')
})

test('previewKind: degenerierte Eingaben werfen nicht', () => {
  assert.equal(previewKind(null), 'text')
  assert.equal(previewKind(undefined), 'text')
  assert.equal(previewKind('string'), 'text')
})

test('isToggleable: nur markdown/html', () => {
  assert.equal(isToggleable('markdown'), true)
  assert.equal(isToggleable('html'), true)
  assert.equal(isToggleable('image'), false)
  assert.equal(isToggleable('pdf'), false)
  assert.equal(isToggleable('text'), false)
})
