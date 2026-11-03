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

/** Bridge-Kandidaten in Versuch-Reihenfolge: AIUI_VISION_MODEL ("provider@id")
 *  zuerst, dann alle image-fähigen Modelle mit AUFGELÖSTER Auth (gleicher
 *  Filter wie getAvailableModels — ein Katalog-Eintrag ohne Key wäre ein
 *  toter Bridge-Call). Das aktuelle selbst taugt nicht — es ist ja text-only.
 *  Der erste Kandidat kann am Provider scheitern (z. B. „model not supported
 *  with a ChatGPT account") — bridgeImages versucht daher die Liste durch. */
export async function pickBridgeModels(rt, currentRef) {
  const envRef = (process.env.AIUI_VISION_MODEL || '').trim()
  const imageModels = rt.getModels().filter(isImageCapable)
  if (!imageModels.length) return []
  const candidates = []
  if (envRef) {
    const envPick = imageModels.find(m => `${m.provider}@${m.id}` === envRef)
    if (envPick) candidates.push(envPick)
  }
  for (const m of imageModels) {
    if (`${m.provider}@${m.id}` === currentRef) continue
    if (candidates.some(c => `${c.provider}@${c.id}` === `${m.provider}@${m.id}`)) continue
    try { if (await rt.getAuth(m.provider)) candidates.push(m) } catch { /* nächstes */ }
  }
  return candidates
}

/** Erster Kandidat (Test-Seam, alte Signatur). */
export async function pickBridgeModel(rt, currentRef) {
  return (await pickBridgeModels(rt, currentRef))[0] ?? null
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
 * der am Prompt angehängte Block; ok:false, wenn keine Kandidaten existieren
 * oder ALLE scheitern (Kandidaten-Fallback: ein Provider, der das Modell
 * ablehnt, ist kein Grund aufzugeben — der nächste Kandidat versucht es).
 */
export async function bridgeImages({ rt, images, currentModelRef }) {
  const candidates = await pickBridgeModels(rt, currentModelRef)
  if (!candidates.length) return { ok: false, reason: 'no vision model available' }
  const sections = []
  let lastReason = 'no attempts'
  for (let i = 0; i < images.length; i++) {
    const img = images[i]
    const dataHash = hashBytes(Buffer.from(img.data || '', 'base64'))
    const cachePath = img.cachePath ? cachePathFor(img.cachePath) : null
    let description = cachePath ? await cachedDescription(cachePath, dataHash) : null
    if (description == null) {
      description = await describeWithCandidates(rt, candidates, img, (r) => { lastReason = r })
      if (description == null) return { ok: false, reason: lastReason }
      if (cachePath) writeCache(cachePath, dataHash, description)
    }
    sections.push(`[Image ${i + 1}${img.label ? `: ${img.label}` : ''}]\n${description}`)
  }
  return {
    ok: true,
    textSection: `\n\n[The attached image${images.length > 1 ? 's' : ''} cannot be sent to this text-only model. Vision-bridge description${images.length > 1 ? 's' : ''}:\n${sections.join('\n\n')}\n]`,
  }
}

/** Ein Bild über die Kandidatenliste beschreiben; der erste Erfolg gewinnt.
 *  Rückgabe: Beschreibung oder null (lastReason via onFail gesetzt). */
async function describeWithCandidates(rt, candidates, img, onFail) {
  for (const bridge of candidates) {
    // Eigene Deadline pro Call — StreamOptions kennt KEIN timeoutMs (nur
    // signal); ohne Abort würde ein hängender Provider den Prompt parken.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`bridge timeout after ${BRIDGE_TIMEOUT_MS / 1000}s`)), BRIDGE_TIMEOUT_MS)
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
        { signal: controller.signal },
      )
      if (message?.stopReason === 'error' && message.errorMessage) {
        onFail(`bridge model ${bridge.provider}@${bridge.id} error: ${message.errorMessage}`)
        continue // Provider lehnt das Modell ab → nächster Kandidat
      }
      const description = String(message?.content?.map(c => c.text || '').join('') || '').trim()
      if (!description) {
        onFail(`empty bridge response (model ${bridge.provider}@${bridge.id}, stopReason=${message?.stopReason})`)
        continue
      }
      return description
    } catch (e) {
      onFail(e?.message || 'bridge call failed')
      continue
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

export function _resetVisionBridgeForTest() { /* stateless — Test-Seam für Konsistenz */ }
