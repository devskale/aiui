// ════════════════════════════════════════════════════════════════════
// attachment-limit — kappt die Anzahl der Attachment-Dateien pro Prompt.
//
// Jedes Bild geht als Base64-dataUrl in den Prompt-Body (server/index.js
// /api/prompt, ~200mb JSON-Limit). Eine 10-Seiten-Scan-Set kann mehrere MB
// base64 pro Bild sein — viele Attachments blähen den Prompt auf, kosten
// Upload-Zeit und überlasten die Vision-API. Der Cap verhindert das.
//
// Rein: `existingCount, incomingCount` → `{ accepted, rejected, limit }`.
// Wirft nie. Der Wert ist nur die Anzahl; die Datei-Objekte bleiben beim
// Aufrufer.
// ════════════════════════════════════════════════════════════════════

export const MAX_ATTACHMENTS = 10

/**
 * Bestimmt, wie viele der neu hinzugefügten Attachments angenommen werden,
 * ohne das Gesamtlimit zu überschreiten.
 *
 * @param {number} existingCount aktuelle Attachment-Anzahl
 * @param {number} incomingCount Anzahl der neu hinzugefügten
 * @returns {{ accepted: number, rejected: number, limit: number }}
 */
export function enforceAttachmentLimit(existingCount, incomingCount) {
  const existing = Number.isFinite(existingCount) ? Math.max(0, existingCount) : 0
  const incoming = Number.isFinite(incomingCount) ? Math.max(0, incomingCount) : 0

  const room = Math.max(0, MAX_ATTACHMENTS - existing)
  const accepted = Math.min(room, incoming)
  const rejected = incoming - accepted

  return { accepted, rejected, limit: MAX_ATTACHMENTS }
}
