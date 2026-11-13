// ════════════════════════════════════════════════════════════════════
// host-actions — agent-invoked actions executed by the EMBED HOST page
// (ADR-0006 Phase 2, "Host-Actions (allowlist + Confirm)").
//
// A widget key may declare host-approved actions (hostActions: [{ name,
// description }]). The agent gets a `host_action` tool whose schema enums
// exactly those names — the allowlist is enforced HERE, at tool-call time.
// execute() parks a pending entry (ask-tool pattern) and pushes a
// `host_action` SSE event: the confirm card the widget renders
// (RiskConfirmation, ideas.md §13 — nothing executes before the visitor
// confirms). On Confirm the widget dispatches `ai-chat:host-action` to the
// HOST page; the host executes and reports back through the element
// method → POST /api/widget/host-action/answer → resolveHostAction. The
// host never touches aiui credentials — the widget's authenticated
// transport relays (host JS gets no blanket trust, ADR D5).
//
// Decline / timeout / abort resolve with a stated status so the agent
// proceeds instead of hanging — same contract as ask. Widget visitors
// only; the main app has no host page.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 10 * 60_000
const MAX_ACTIONS = 10
const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$/
const MAX_ARGS_DISPLAY = 2000 // what the confirm card (SSE payload) shows
const MAX_RESULT = 4000       // what the host's result may carry back

const pending = new Map() // scope → Map(id → { resolve, timer })

/** Pure normalization of a key's hostActions block: array, ≤10 entries,
 *  name NAME_RE + description ≤200 chars. Invalid entries drop silently
 *  (same tolerant stance as normalizeWidgetKeys). Returns []. */
export function normalizeHostActions(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  for (const a of raw.slice(0, MAX_ACTIONS)) {
    if (!a || typeof a !== 'object') continue
    const name = String(a.name || '').trim()
    const description = String(a.description || '').trim().slice(0, 200)
    if (!NAME_RE.test(name) || !description) continue
    if (out.some(x => x.name === name)) continue // dedupe, first wins
    out.push({ name, description })
  }
  return out
}

function displayArgs(args) {
  if (args === undefined || args === null) return null
  try {
    const s = JSON.stringify(args, null, 1)
    return s.length > MAX_ARGS_DISPLAY ? s.slice(0, MAX_ARGS_DISPLAY) + '…' : s
  } catch { return String(args).slice(0, MAX_ARGS_DISPLAY) }
}

function cleanup(scope, id, entry) {
  clearTimeout(entry.timer)
  const map = pending.get(scope)
  if (map) { map.delete(id); if (!map.size) pending.delete(scope) }
}

/** Build the per-visitor host_action tool. `actions` is the key's
 *  normalized allowlist (normalizeHostActions output); empty → null (the
 *  caller wires nothing — the tool simply does not exist for that key). */
export function createHostActionTool(scope, bus, actions, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const allow = normalizeHostActions(actions)
  if (!allow.length) return null
  const byName = new Map(allow.map(a => [a.name, a]))
  return {
    name: 'host_action',
    label: 'Run a host-page action',
    description:
      'Run one of the host page\u2019s allowlisted actions — the page the visitor is on executes it, ' +
      'after the visitor explicitly confirms in the chat. Available actions:\n' +
      allow.map(a => `- ${a.name}: ${a.description}`).join('\n'),
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: allow.map(a => a.name),
          description: 'One of the allowlisted host actions.',
        },
        args: {
          type: 'object',
          description: 'Optional arguments for the action (action-specific; keep minimal).',
        },
      },
      required: ['action'],
    },
    async execute(_toolCallId, params, signal) {
      const name = String(params?.action || '')
      const def = byName.get(name)
      if (!def) {
        // Enum violations shouldn't reach here, but the allowlist is the
        // security boundary — fail hard, never park an unlisted action.
        return { content: [{ type: 'text', text: `host_action: '${name}' is not allowlisted for this key.` }] }
      }
      const args = params?.args !== undefined && params?.args !== null && typeof params.args === 'object' ? params.args : null
      const id = crypto.randomUUID()
      bus.push('host_action', { id, action: name, description: def.description, args: displayArgs(args) }) // the confirm card
      const answer = await new Promise(resolve => {
        const entry = { resolve, timer: null }
        entry.timer = setTimeout(() => { cleanup(scope, id, entry); resolve({ status: 'timeout' }) }, timeoutMs)
        if (!pending.has(scope)) pending.set(scope, new Map())
        pending.get(scope).set(id, entry)
        signal?.addEventListener('abort', () => { cleanup(scope, id, entry); resolve({ status: 'aborted' }) }, { once: true })
      })
      if (answer.status) {
        const note = answer.status === 'declined'
          ? 'the visitor DECLINED it. Do not retry; state the decline and continue.'
          : `the action was not executed (${answer.status}). Continue on a stated default.`
        return { content: [{ type: 'text', text: `(host_action '${name}': ${note})` }], details: { id, executed: false, status: answer.status } }
      }
      const result = String(answer.result || '').slice(0, MAX_RESULT)
      const text = answer.ok === false
        ? `Host action '${name}' ran on the host page but reported failure${result ? ': ' + result : '.'}`
        : `Host action '${name}' executed by the host${result ? ': ' + result : '.'}`
      return { content: [{ type: 'text', text }], details: { id, executed: answer.ok !== false } }
    },
  }
}

/** Hand the host's (or the visitor's decline) answer to a parked action.
 *  Route: POST /api/widget/host-action/answer → { declined } | { ok, result }. */
export function resolveHostAction(scope, id, payload = {}) {
  const entry = pending.get(scope)?.get(id)
  if (!entry) return false
  cleanup(scope, id, entry)
  if (payload.declined) entry.resolve({ status: 'declined' })
  else entry.resolve({ ok: payload.ok !== false, result: payload.result })
  return true
}

/** Run aborted — every parked host action of this scope resolves immediately. */
export function abortHostActions(scope) {
  const map = pending.get(scope)
  if (!map) return 0
  let n = 0
  for (const [id, entry] of map) { cleanup(scope, id, entry); entry.resolve({ status: 'aborted' }); n++ }
  return n
}

export function _resetHostActionsForTest() {
  for (const [scope, map] of pending) for (const [id, entry] of map) cleanup(scope, id, entry)
}
export const pendingHostActionCount = (scope) => pending.get(scope)?.size || 0
