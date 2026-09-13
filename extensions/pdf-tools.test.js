// pdf-tools.test.js — the pdf2md-style OCR cache helpers. Run: node --test extensions/
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cachePathFor, cacheIsFresh } from './pdf-tools/index.js'

test('cachePathFor: sibling "<name>.pdf.md"', () => {
  assert.equal(cachePathFor('/ws/uploads/doc.pdf'), '/ws/uploads/doc.pdf.md')
  assert.equal(cachePathFor('/ws/uploads/doc.PDF'), '/ws/uploads/doc.PDF.md')
})

test('cacheIsFresh: fresh when the .md is at least as new as the PDF', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-pdftools-'))
  const pdf = path.join(dir, 'doc.pdf')
  const md = cachePathFor(pdf)
  fs.writeFileSync(pdf, 'pdf')
  assert.equal(cacheIsFresh(pdf, md), false, 'no md yet')
  fs.writeFileSync(md, '# ocr')
  assert.equal(cacheIsFresh(pdf, md), true, 'md newer than pdf')
  const future = new Date(Date.now() + 60_000)
  fs.utimesSync(pdf, future, future)
  assert.equal(cacheIsFresh(pdf, md), false, 'PDF re-uploaded → cache stale')
  assert.equal(cacheIsFresh(pdf, path.join(dir, 'missing.md')), false, 'missing md')
  fs.rmSync(dir, { recursive: true, force: true })
})
