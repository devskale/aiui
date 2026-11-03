// attachment-chip.test.js — Chip-Daten: Typ-Erkennung, Größe, PDF-Seiten.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chipData, humanSize } from './attachment-chip.js'

test('Typ-Erkennung: image / pdf / text / other', () => {
  assert.equal(chipData({ isImage: true, name: 'x.png' }).kind, 'image')
  assert.equal(chipData({ mimetype: 'application/pdf', name: 'a.pdf' }).kind, 'pdf')
  assert.equal(chipData({ name: 'notes.md' }).kind, 'text')
  assert.equal(chipData({ name: 'scan.PDF' }).kind, 'pdf') // case-insensitive
  assert.equal(chipData({ name: 'data.xlsx' }).kind, 'other')
  assert.equal(chipData(null).kind, 'other') // wirft nie
})

test('Seiten nur für PDFs mit gültiger Zahl', () => {
  assert.equal(chipData({ name: 'a.pdf', pages: 12 }).pages, 12)
  assert.equal(chipData({ name: 'a.pdf', pages: 0 }).pages, null)
  assert.equal(chipData({ name: 'a.pdf' }).pages, null)
  assert.equal(chipData({ name: 'a.md', pages: 5 }).pages, null)
})

test('humanSize: kompakt + nie werfend', () => {
  assert.equal(humanSize(512), '512 B')
  assert.equal(humanSize(2048), '2 KB')
  assert.equal(humanSize(5 * 1024 * 1024), '5.0 MB')
  assert.equal(humanSize(undefined), '')
  assert.equal(humanSize(-5), '')
})
