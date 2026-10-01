// ════════════════════════════════════════════════════════════════════
// draft-store — persistiert den ungesendeten Input-Text pro Session.
//
// Motivation: bei langen Recherche-Turns (Firmenindex, 375s+) will man den
// nächsten Prompt schon tippen, während der Agent noch läuft. Ein Reload
// oder Tab-Wechsel darf den halbfertigen Text nicht vernichten.
//
// localStorage (überlebt Reload), gekeyt pro User + Session, damit parallele
// Sessions sich nicht gegenseitig überschreiben. Wirft nie (private mode /
// Quota → stiller No-op). Der Wert ist nur der Text; Attachments sind
// Dateien mit Server-Pfad und werden hier bewusst nicht mitgespeichert.
// ════════════════════════════════════════════════════════════════════

const PREFIX = 'aiui-draft:'

// Stabiler Key pro User + Session. 'new' als Fallback, wenn noch keine
// Session existiert (vor dem ersten Prompt) — so bleibt der Text auch
// vor dem ersten Senden erhalten.
export function draftKey(user, sessionId) {
  const u = (user || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_')
  const s = sessionId ? String(sessionId).replace(/[^a-zA-Z0-9_-]/g, '_') : 'new'
  return `${PREFIX}${u}:${s}`
}

// Speichert den Text unter `key`. Leerer Text löscht den Eintrag (kein
// toter Müll in localStorage). Wirft nie.
export function saveDraft(key, text) {
  try {
    if (!text || !text.trim()) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, text)
  } catch {
    /* private mode / quota — stiller No-op */
  }
}

// Liefert den gespeicherten Text (oder '' wenn keiner existiert). Wirft nie.
export function loadDraft(key) {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

// Löscht den Draft. Wirft nie.
export function clearDraft(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* no-op */
  }
}
