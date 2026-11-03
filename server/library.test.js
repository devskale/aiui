// library.test.js — Bibliothek: Liste, #token-Resolution, Inline-Blocks,
// Token-Mathematik. Temp-Workspace statt echtem Home.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-library-'))
const uploads = path.join(TMP, 'uploads')
fs.mkdirSync(uploads, { recursive: true })

const {
  listLibrary, resolveDocToken, docContextBlock, libraryKind,
  extractDocTokens, stripDocTokens, DOC_TOKEN_RE,
} = await import('./library.js')

beforeEach(() => {
  for (const e of fs.readdirSync(uploads, { withFileTypes: true })) {
    if (e.isDirectory()) fs.rmSync(path.join(uploads, e.name), { recursive: true, force: true })
    else fs.unlinkSync(path.join(uploads, e.name))
  }
})

function put(name, content) {
  fs.writeFileSync(path.join(uploads, name), content)
  return path.join(uploads, name)
}

test('libraryKind: image / pdf / text / other', () => {
  assert.equal(libraryKind('foto.PNG'), 'image')
  assert.equal(libraryKind('bericht.pdf'), 'pdf')
  assert.equal(libraryKind('notizen.md'), 'text')
  assert.equal(libraryKind('daten.csv'), 'text')
  assert.equal(libraryKind('tabelle.xlsx'), 'other')
})

test('listLibrary: flach, mtime-desc, q-Filter, dotfiles weg', () => {
  put('a-report.md', 'A')
  put('b-scan.pdf', '%PDF-1.4 fake')
  put('.hidden.txt', 'x')
  fs.mkdirSync(path.join(uploads, 'sub'))
  const all = listLibrary(TMP, '')
  assert.deepEqual(all.map(d => d.name).sort(), ['a-report.md', 'b-scan.pdf'])
  assert.equal(all[0].relPath, 'uploads/' + all[0].name)
  assert.ok(listLibrary(TMP, 'scan').every(d => d.name.includes('scan')))
  assert.equal(listLibrary(path.join(TMP, 'kein-dir'), '').length, 0) // wirft nie
})

test('resolveDocToken: exakt (ci), ohne Extension, Mehrdeutigkeit → neuester', () => {
  put('Bericht.PDF', '%PDF')
  put('notizen.md', 'n')
  assert.equal(resolveDocToken(TMP, 'bericht.pdf').name, 'Bericht.PDF')
  assert.equal(resolveDocToken(TMP, 'bericht').name, 'Bericht.PDF', 'Extension optional')
  assert.equal(resolveDocToken(TMP, '  NOTIZEN  ').name, 'notizen.md')
  assert.equal(resolveDocToken(TMP, 'fehlt'), null)
  assert.equal(resolveDocToken(TMP, ''), null)
})

test('docContextBlock: Text inline (gecappt), Bild → null', async () => {
  put('lang.md', 'x'.repeat(30_000))
  const e = resolveDocToken(TMP, 'lang.md')
  const block = await docContextBlock(TMP, e)
  assert.ok(block.startsWith('[Document: lang.md]'))
  assert.ok(block.length < 26_000, 'gecappt')
  assert.ok(block.includes('truncated'))
  assert.equal(await docContextBlock(TMP, resolveDocToken(TMP, 'fehlt') ?? { kind: 'image', abs: '/nope' }), null)
})

test('docContextBlock: PDF mit frischem OCR-Cache inline; ohne Cache + ohne Textlayer → read_pdf-Hinweis', async () => {
  const pdfPath = put('scan.pdf', '%PDF-1.4 fake-minimal')
  put('scan.pdf.md', '# OCR result\nInhalt aus LlamaParse.')
  const withCache = await docContextBlock(TMP, resolveDocToken(TMP, 'scan'))
  assert.ok(withCache.includes('(extracted markdown)'))
  assert.ok(withCache.includes('OCR result'))

  fs.unlinkSync(`${pdfPath}.md`)
  // kaputtes PDF ohne Cache: pdfjs wirft → catch → null? Nein: kein Cache, pdfjs
  // scheitert → catch in docContextBlock → null. Der read_pdf-Hinweis-Pfad braucht
  // ein gültiges leeres PDF — hier nur der Fehlertyp gepinnt.
  assert.equal(await docContextBlock(TMP, resolveDocToken(TMP, 'scan')), null)
})

test('Token-Mathematik: extract + strip nur aufgelöster, Hashtags bleiben', () => {
  const text = 'Vergleiche #bericht und #fehlt sowie #notizen. #tag'
  const tokens = extractDocTokens(text)
  assert.deepEqual(tokens.map(t => t.name), ['bericht', 'fehlt', 'notizen', 'tag'])
  const resolved = tokens.filter(t => t.name !== 'fehlt' && t.name !== 'tag')
  const stripped = stripDocTokens(text, resolved)
  assert.ok(!stripped.includes('#bericht'))
  assert.ok(!stripped.includes('#notizen'))
  assert.ok(stripped.includes('#fehlt'), 'unaufgelöst bleibt')
  assert.ok(stripped.includes('#tag'), 'gewöhnlicher Hashtag bleibt')
})

test('DOC_TOKEN_RE: Grenzfälle — leerer String, mehrere Zeilen', () => {
  assert.deepEqual(extractDocTokens(''), [])
  const ts = extractDocTokens('#a\n#b-c_d.e')
  assert.equal(ts.length, 2)
  assert.equal(new RegExp(DOC_TOKEN_RE.source, 'g').exec('#x y')[0], '#x')
})
