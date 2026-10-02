// ════════════════════════════════════════════════════════════════════
// widget-transport — die EINE Naht zwischen Embed-Widget und Server
// (ADR-0006 D4: ChatTransport-Seam).
//
// Verantwortung: Key → Token minten, SSE-Stream (token-authentifiziert)
// abonnieren, Prompts (inkl. pageContext als DATEN) senden. Nichts davon
// weiß etwas von React oder dem DOM — dadurch mock- und testbar ohne
// Server.
//
// Auth-Kette (ADR-0006 D1): der PUBLIC Key lebt beim Host (data-key /
// Attribut), nie im Bundle. Er wird einmal pro Öffnen gegen ein 1h-Token
// getauscht; alle folgenden Requests tragen nur das Token.
// ════════════════════════════════════════════════════════════════════

/** Stabile Besucher-ID pro Key (localStorage des Host-Ursprungs). */
export function visitorIdFor(key, storage = globalThis.localStorage) {
  const k = `aiui-widget-visitor:${key}`
  try {
    let v = storage.getItem(k)
    // VISITOR_RE serverseitig: [\w-]{1,64} — UUID ohne Bindestriche passt.
    if (!v || !/^[\w-]{1,64}$/.test(v)) {
      v = (globalThis.crypto?.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, '')
      storage.setItem(k, v)
    }
    return v
  } catch {
    // localStorage gesperrt → flüchtige ID (Session-Persistenz ist dann eh
    // nicht gegeben; der Server-Scope funktioniert trotzdem).
    return 'v' + String(Math.random()).slice(2).padEnd(8, '0')
  }
}

/** Prompt-Body: Text + Page-Context als DATEN (SOTA, ADR-0006 D5). Pure. */
export function buildPromptBody(text, pageContext) {
  return { text, pageContext: pageContext ?? {} }
}

export class WidgetTransport {
  /**
   * @param {object} opts
   * @param {string} opts.apiBase    Origin der aiui-Instanz (z. B.
   *                                 'https://aiui.example.at') — vom einbindenden
   *                                 <script src> abgeleitet, nie geraten.
   * @param {string} opts.key        public Embed-Key (data-key / Attribut)
   * @param {fetch} [opts.fetchImpl] testbar (Default: globalThis.fetch)
   */
  constructor({ apiBase, key, fetchImpl } = {}) {
    this.apiBase = String(apiBase || '').replace(/\/$/, '')
    this.key = key
    this._fetch = fetchImpl || globalThis.fetch?.bind(globalThis)
    this.token = null
    this.expiresAt = 0
    this.config = null // { variant, theme, greeting, launcherLabel } aus dem Mint
    this.visitor = visitorIdFor(this.key)
  }

  get headers() { return this.token ? { Authorization: `Bearer ${this.token}` } : {} }

  /** Key → Token tauschen (lazy, beim ersten Öffnen — nicht beim Script-Load,
   *  damit ein Seitenaufruf ohne Chat-Öffnung kein Mint-Rate-Limit verbrennt). */
  async connect() {
    if (this.token && Date.now() < this.expiresAt - 60_000) return this
    if (!this._fetch) throw new Error('no fetch available')
    const r = await this._fetch(`${this.apiBase}/api/widget/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: this.key }),
    })
    if (!r.ok) {
      let msg = `session request failed (${r.status})`
      try { msg = (await r.json()).error || msg } catch {}
      const err = new Error(msg); err.status = r.status; throw err
    }
    const data = await r.json()
    this.token = data.token
    this.expiresAt = data.expiresAt || 0
    this.config = data.config || {}
    return this
  }

  /**
   * SSE-Stream als EventSource. Liefert die Source (zum Schließen) und
   * reicht benannte Events an onEvent(type, data) weiter.
   */
  openStream(onEvent, EventSourceImpl = globalThis.EventSource) {
    if (!EventSourceImpl) throw new Error('EventSource not available')
    const url = `${this.apiBase}/api/widget/stream?visitor=${encodeURIComponent(this.visitor)}&token=${encodeURIComponent(this.token)}`
    const es = new EventSourceImpl(url)
    const kinds = [
      'user_prompt', 'user_steer', 'message_update', 'message_start', 'message_end',
      'tool_execution_start', 'tool_execution_update', 'tool_execution_end',
      'queue_update', 'session_status', 'session_stats', 'session_history',
      'thinking_level_changed', 'compaction_start', 'compaction_end', 'error',
    ]
    for (const kind of kinds) {
      es.addEventListener(kind, (ev) => {
        let data = null
        try { data = JSON.parse(ev.data) } catch { data = ev.data }
        onEvent(kind, data)
      })
    }
    return es
  }

  /** Prompt absetzen (steuert serverseitig automatisch, wenn noch gestreamt
   *  wird). pageContext ist DATEN über die Host-Seite, nie Instruktion. */
  async sendPrompt(text, pageContext) {
    if (!this._fetch) throw new Error('no fetch available')
    const r = await this._fetch(
      `${this.apiBase}/api/widget/prompt?visitor=${encodeURIComponent(this.visitor)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify(buildPromptBody(text, pageContext)),
      },
    )
    if (!r.ok) {
      let msg = `prompt failed (${r.status})`
      try { msg = (await r.json()).error || msg } catch {}
      const err = new Error(msg); err.status = r.status; throw err
    }
    return r.json()
  }
}
