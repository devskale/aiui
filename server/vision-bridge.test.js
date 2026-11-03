// vision-bridge.test.js — Bridge-Modell-Wahl, Transcribe + Cache, Fehlerpfade.
// Import-Reihenfolge (auth.test.js-Muster): ENV zuerst, dann dynamischer Import.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aiui-bridge-'))
process.env.AIUI_VISION_MODEL = '' // pro Test gesetzt

const { isImageCapable, pickBridgeModel, bridgeImages, cachePathFor } = await import('./vision-bridge.js')

beforeEach(() => {
  process.env.AIUI_VISION_MODEL = ''
  for (const f of fs.readdirSync(TMP)) fs.unlinkSync(path.join(TMP, f))
})

const IMG = { mimeType: 'image/png', data: Buffer.from('fakepng').toString('base64') }

function fakeRt(models, impl) {
  return { getModels: () => models, completeSimple: impl }
}

const VISION = { provider: 'p', id: 'see-1', input: ['text', 'image'] }
const VISION2 = { provider: 'p', id: 'see-2', input: ['text', 'image'] }
const TEXTONLY = { provider: 'p', id: 'blind-1', input: ['text'] }

test('isImageCapable: nur models mit input:image', () => {
  assert.equal(isImageCapable(VISION), true)
  assert.equal(isImageCapable(TEXTONLY), false)
  assert.equal(isImageCapable(null), false)
})

test('pickBridgeModel: env gewinnt, sonst erstes image-Modell ≠ aktuell, sonst null', () => {
  const rt = fakeRt([TEXTONLY, VISION, VISION2])
  assert.equal(pickBridgeModel(rt, 'p@blind-1')?.id, 'see-1')
  process.env.AIUI_VISION_MODEL = 'p@see-2'
  assert.equal(pickBridgeModel(rt, 'p@blind-1')?.id, 'see-2', 'env override')
  assert.equal(pickBridgeModel(fakeRt([TEXTONLY]), 'p@blind-1'), null, 'kein vision-Modell')
  assert.equal(pickBridgeModel(fakeRt([VISION]), 'p@see-1'), null, 'nur das aktuelle selbst')
})

test('bridgeImages: Beschreibung landet im Text-Block; Cache macht den zweiten Call überflüssig', async () => {
  const cachePath = path.join(TMP, 'pic.png')
  let calls = 0
  const rt = fakeRt([VISION], async () => {
    calls++
    return { content: [{ type: 'text', text: 'A red square on white background.' }] }
  })
  const r1 = await bridgeImages({ rt, images: [{ ...IMG, cachePath }], currentModelRef: 'p@blind-1' })
  assert.equal(r1.ok, true)
  assert.ok(r1.textSection.includes('A red square on white background.'))
  assert.ok(r1.textSection.includes('text-only model'))
  assert.ok(fs.existsSync(cachePathFor(cachePath)), 'Cache geschrieben')
  assert.equal(calls, 1)

  const r2 = await bridgeImages({ rt, images: [{ ...IMG, cachePath }], currentModelRef: 'p@blind-1' })
  assert.equal(r2.ok, true)
  assert.equal(calls, 1, 'Cache-Hit: kein zweiter Bridge-Call')
})

test('Fehlerpfade: kein Bridge-Modell / leerer Call → ok:false mit Reason', async () => {
  const noModel = await bridgeImages({ rt: fakeRt([TEXTONLY]), images: [{ ...IMG }], currentModelRef: 'p@blind-1' })
  assert.equal(noModel.ok, false)
  assert.match(noModel.reason, /no vision model/)

  const failing = await bridgeImages({
    rt: fakeRt([VISION], async () => { throw new Error('gateway down') }),
    images: [{ ...IMG }],
    currentModelRef: 'p@blind-1',
  })
  assert.equal(failing.ok, false)
  assert.match(failing.reason, /gateway down/)
})
