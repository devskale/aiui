// ════════════════════════════════════════════════════════════════════
// variant — corner | modal | inline (ADR-0006 Zielbild & Varianten).
//
// Config-getrieben (Key-Config = Daten), Attribut am Element gewinnt für
// Host-Overrides. Pure → ohne DOM testbar.
// ════════════════════════════════════════════════════════════════════
const VARIANTS = ['corner', 'modal', 'inline']

/** Attribut (Element) schlägt Key-Config; unbekannt/leer → 'corner'. */
export function resolveVariant(attr, configValue) {
  const a = String(attr ?? '').toLowerCase().trim()
  if (VARIANTS.includes(a)) return a
  const c = String(configValue ?? '').toLowerCase().trim()
  if (VARIANTS.includes(c)) return c
  return 'corner'
}
