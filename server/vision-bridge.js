// ════════════════════════════════════════════════════════════════════
// vision-bridge — Text-only-Modell + Bild → Bild wird von einem
// vision-fähigen Modell beschrieben, die Beschreibung landet als
// Text-Evidence am Prompt (pi-web-ui vision-bridge.ts-Muster).
//
// Der harte Client-Block („remove them to send") gilt nur für Attachment-
// Bilder — @-mentionierte Workspace-Bilder umgehen ihn (attachMentionedImages
// pusht sie immer). Diese Bridge ist die serverseitige Antwort: statt einer
// undefinierten Fehlerlage sieht das Text-only-Modell eine präzise
// Beschreibung. Transkripte cachen neben der Bilddatei (<name>.vision.md,
// gleiche Familie wie der read_pdf-<name>.pdf.md-Cache) — wiederholte Sends
// kosten keinen Bridge-Call.
//
// Keine neue Dependency: der One-Shot läuft über die bestehende ModelRuntime
// (Models.completeSimple — pi-ai ist Transitivität genug).
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const BRIDGE_TIMEOUT_MS = 90_000
const BRIDGE_PROMPT =
  'Describe this image precisely and completely for a reader who cannot see it: ' +
  'all visible text verbatim, objects, layout, colors, and anything else relevant. Plain text, no preamble.'

export function isImageCapable(model) {
  return Array.isArray(model?.input) && model.input.includes('image')
}

export const cachePathFor = (imagePath) => `${imagePath}.vision.md`

/** Bridge-Modell wählen: AIUI_VISION_MODEL ("provider@id") gewinnt, sonst das
 *  erste image-fähige Modell des Katalogs (das aktuelle selbst taugt nicht —
 *  es ist ja text-only). Model-Objekt oder null. */
export function pickBridgeModel(rt, currentRef) {
  const envRef = (process.env.AIUI_VISION_MODEL || '').trim()
  const imageModels = rt.getModels().filter(isImageCapable)
  if (!imageModels.length) return null
  if (envRef) {
    const envPick = imageModels.find(m => `${m.provider}@${m.id}` === envRef)
    if (envPick) return envPick
  }
  return imageModels.find(m => `${m.provider}@${m.id}` !== currentRef) || null
}

function hashBytes(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16)
}

async function cachedDescription(cachePath, dataHash) {
  try {
    const raw = fs.readFileSync(cachePath, 'utf8')
    const [hash, ...rest] = raw.split('\n')
    if (hash === `# bridge-cache:${dataHash}`) return rest.join('\n')
  } catch { /* kein Cache */ }
  return null
}

function writeCache(cachePath, dataHash, description) {
  try {
    fs.writeFileSync(cachePath, `# bridge-cache:${dataHash}\n${description}`)
  } catch { /* best effort — Cache ist Optimierung, keine Pflicht */ }
}

/**
 * Beschreibt Bilder über ein vision-fähiges Modell. images: [{ mimeType, data
 * (base64), cachePath? }]. Rückgabe: { ok, textSection } — textSection ist
 * der am Prompt angehängte Block; ok:false, wenn kein Bridge-Modell existiert
 * oder ein Call fehlschlägt (Anrufer entscheidet über den Fallback).
 */
export async function bridgeImages({ rt, images, currentModelRef }) {
  const bridge = pickBridgeModel(rt, currentModelRef)
  if (!bridge) return { ok: false, reason: 'no vision model available' }
  const sections = []
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const dataHash = hashBytes(Buffer.from(img.data || '', 'base64'))
    const cachePath = img.cachePath ? cachePathFor(img.cachePath) : null
    let description = cachePath ? await cachedDescription(cachePath, dataHash) : null
    if (description == null) {
      try {
        const message = await rt.completeSimple(
          bridge,
          {
            systemPrompt: 'You convert images into faithful text descriptions.',
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: BRIDGE_PROMPT },
                { type: 'image', mimeType: img.mimeType || 'image/png', data: img.data },
              ],
            }],
          },
          { timeoutMs: BRIDGE_TIMEOUT_MS },
        )
        description = String(message?.content?.map(c => c.text || '').join('') || '').trim()
        if (!description) return { ok: false, reason: 'empty bridge response' }
        if (cachePath) writeCache(cachePath, dataHash, description)
      } catch (e) {
        return { ok: false, reason: e.message || 'bridge call failed' }
      }
    }
    sections.push(`[Image ${i + 1}${img.label ? `: ${img.label}` : ''}]\n${description}`)
  }
  return {
    ok: true,
    textSection: `\n\n[The attached image${images.length > 1 ? 's' : ''} cannot be sent to this text-only model. Vision-bridge description${images.length > 1 ? 's' : ''}:\n${sections.join('\n\n')}\n]`,
  }
}

export function _resetVisionBridgeForTest() { /* stateless — Test-Seam für Konsistenz */ }
