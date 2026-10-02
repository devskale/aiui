// ════════════════════════════════════════════════════════════════════
// embed.jsx — Entry des Embed-Bundles (ADR-0006).
//
// Einbindung beim Host (eine Zeile):
//   <script src="https://<aiui-host>/embed.js" data-key="wk_…" defer></script>
// oder programmatisch:
//   <ai-chat key="wk_…"></ai-chat>   // el.open() / el.close() / el.send(text)
//
// Minimalismus (ADR-0006 D4): dieser Entry liest data-*/Attribute, leitet
// die aiui-Origin vom eigenen <script src> ab (nie geraten — data-api am
// script-Tag oder api-Attribut am Element übersteuert), registriert das
// Element. Kein Secret, keine Business-Logik; Theme + Config kommen als
// Daten aus dem Mint. EINE Transport-Instanz pro Element (kein Doppel-Mint).
//
// Host-Bridge (SOTA, D5): el.open/close/send + Events ai-chat:open/close/
// reply/settled — der Host kann den Agenten in seine eigene UX einbauen,
// das Widget ist keine Chat-in-einer-Box.
// ════════════════════════════════════════════════════════════════════
import { createRoot } from 'react-dom/client'
// ?inline: Styles als String — injiziert in den SHADOW-Root, nach außen
// gekapselt (Host-CSS kann das Widget nicht zerreißen und umgekehrt).
import appStyles from '../index.css?inline'
import widgetStyles from './widget.css?inline'
import { AiChatPanel } from './AiChatPanel.jsx'
import { applyTheme, safeText } from './theme.js'
import { WidgetTransport } from './widget-transport.js'

// aiui-Origin: eigenes script-src (robust), data-api-Attribut gewinnt.
function resolveApiBase() {
  const s = document.currentScript
  if (s?.dataset?.api) return new URL(s.dataset.api, location.href).origin
  if (s?.src) return new URL(s.src).origin
  return location.origin // <ai-chat> ohne script-src → same-origin-Fallback
}
const API_BASE = resolveApiBase()

class AiChatElement extends HTMLElement {
  connectedCallback() {
    if (this._root) return
    // closed: kein Host-JS kommt ins DOM des Widgets (Isolation in beide
    // Richtungen); Theme läuft über CSS-Custom-Properties, die vererben.
    const shadow = this.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = appStyles + '\n' + widgetStyles
    const mountPoint = document.createElement('div')
    mountPoint.className = 'aiw-root'
    shadow.append(style, mountPoint)

    const api = this.getAttribute('api')
      ? new URL(this.getAttribute('api'), location.href).origin
      : API_BASE
    // EINE Transport-Instanz für Config/Theme UND Chat — der Mint läuft
    // lazy beim ersten open() (useWidgetChat), nicht beim Script-Load.
    const transport = new WidgetTransport({ apiBase: api, key: this.getAttribute('key') || '' })

    // Host-Bridge-Handle: das Panel befüllt open/close/send/onSettled.
    this._controller = {
      onSettled: (lastReplyText) => {
        this.dispatchEvent(new CustomEvent('ai-chat:settled', { bubbles: true, detail: {} }))
        if (lastReplyText) this.dispatchEvent(new CustomEvent('ai-chat:reply', { bubbles: true, detail: { text: lastReplyText } }))
      },
    }

    this._root = createRoot(mountPoint)
    this._root.render(
      <AiChatPanel
        transport={transport}
        launcherLabel={safeText(this.getAttribute('label'), 'Chat')}
        controller={this._controller}
        onTheme={(theme) => applyTheme(mountPoint, theme)}
        variantAttr={this.getAttribute('variant')}
      />,
    )
  }

  disconnectedCallback() {
    this._root?.unmount?.()
    this._root = null
  }

  // ── Host-Bridge (SOTA, ADR-0006 D5) ──
  open() { this._controller.open?.(); this.dispatchEvent(new CustomEvent('ai-chat:open', { bubbles: true })) }
  close() { this._controller.close?.(); this.dispatchEvent(new CustomEvent('ai-chat:close', { bubbles: true })) }
  send(text) { this._controller.send?.(text) }
}

if (!customElements.get('ai-chat')) customElements.define('ai-chat', AiChatElement)

// Auto-Mount: data-key am <script> → eine Zeile reicht (Zielbild ADR-0006).
const s = document.currentScript
if (s?.dataset?.key && !document.querySelector('ai-chat')) {
  const el = document.createElement('ai-chat')
  el.setAttribute('key', s.dataset.key)
  if (s.dataset.label) el.setAttribute('label', s.dataset.label)
  if (s.dataset.variant) el.setAttribute('variant', s.dataset.variant)
  document.body.append(el)
}
