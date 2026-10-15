// ════════════════════════════════════════════════════════════════════
// session-export — JSONL-Session → Markdown (rein)
//
// Issue session-doc-mgmt: Sessions sind Dokumente — Export gehört zur
// Basis-Pflege wie rename/delete. Rein, damit der Transform in node --test
// gepinnt ist: der Server liest nur die Datei und reicht den Text durch.
// Nutzt dieselbe Entry-Pipeline (fromMessage) wie der History-Replay —
// was der Browser zeigt, ist das, was im Export landet.
// ════════════════════════════════════════════════════════════════════
import { fromMessage, attachResult, textOf } from './entry.js'

/** Maximale Länge eines Tool-Outputs im Export (Zeichen). Volle Outputs
 *  leben in der Session selbst — der Export soll lesbar bleiben. */
export const TOOL_OUTPUT_CAP = 2000

function cap(text, n = TOOL_OUTPUT_CAP) {
  if (!text) return ''
  return text.length > n ? text.slice(0, n) + `\n… (truncated, ${text.length} chars total)` : text
}

function escFence(text) {
  // Fence-in-Fence vermeiden: längste Backtick-Run im Text bestimmen
  const run = (text.match(/`+/g) || []).sort((a, b) => b.length - a.length)[0] || '``'
  const fence = '`'.repeat(Math.max(3, run.length + 1))
  return { fence, body: cap(text) }
}

function renderEntry(entry) {
  if (!entry) return null
  if (entry.role === 'user') {
    return `## 🧑 User\n\n${entry.text || '(image message)'}\n`
  }
  if (entry.role === 'error') {
    return `## ⚠️ Error\n\n${entry.text}\n`
  }
  // assistant
  const parts = []
  if (entry.thinkingText) {
    const { fence, body } = escFence(entry.thinkingText)
    parts.push(`<details><summary>Thinking</summary>\n\n${fence}\n${body}\n${fence}\n\n</details>`)
  }
  if (entry.text) parts.push(entry.text)
  for (const tc of entry.toolCalls || []) {
    const args = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2)
    const { fence, body } = escFence(tc.output || '')
    parts.push(
      `**Tool \`${tc.name}\`** ${tc.status === 'error' ? '❌' : tc.status === 'done' ? '✓' : '…'}\n\n` +
      `\`\`\`\n${cap(args, 500)}\n\`\`\`\n\n${fence}\n${body || '(no output)'}\n${fence}`,
    )
  }
  if (parts.length === 0) return null
  return `## 🤖 Assistant\n\n${parts.join('\n\n')}\n`
}

/**
 * JSONL-Message-Entries (bereits geparst, type==='message') → gepaarte
 * Entry-Reihe wie der History-Replay: toolResult heftet an den letzten
 * Assistant-Entry (attachResult), statt als eigene Zeile zu verschwinden.
 * Rein — von toMarkdown benutzt, separat testbar.
 */
export function toEntries(messages) {
  const entries = []
  for (const msg of messages) {
    if (msg?.role === 'toolResult') {
      const last = entries[entries.length - 1]
      if (last?.role === 'assistant') {
        entries[entries.length - 1] = attachResult(last, msg.toolName, textOf(msg.content), msg.isError)
      }
      continue
    }
    const entry = fromMessage(msg)
    if (entry) entries.push(entry)
  }
  return entries
}

/**
 * JSONL-Session-Text → Markdown-Dokument.
 * @param {string} jsonl roher Dateiinhalt (eine Entry-Zeile pro Zeile)
 * @param {{name?: string, id?: string, modified?: string}} meta Kopfrei
 */
export function toMarkdown(jsonl, meta = {}) {
  const messages = []
  let firstUser = ''
  for (const line of String(jsonl).split('\n')) {
    const t = line.trim()
    if (!t) continue
    let entry
    try { entry = JSON.parse(t) } catch { continue } // korrupte Zeile: übergehen
    if (entry?.type !== 'message') continue // session_info/header/usage …: kein Chat
    messages.push(entry.message)
    if (!firstUser && entry.message?.role === 'user') {
      const u = fromMessage(entry.message)
      if (u?.text) firstUser = u.text
    }
  }
  const sections = toEntries(messages).map(renderEntry).filter(Boolean)
  const title = meta.name || firstUser.slice(0, 80) || 'Session export'
  const head = [
    `# ${title}`,
    '',
    `_Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${sections.length} entries${meta.id ? ` · ${meta.id}` : ''}_`,
    '',
    '---',
    '',
  ].join('\n')
  return head + sections.join('\n')
}
