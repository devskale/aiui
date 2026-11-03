// ════════════════════════════════════════════════════════════════════
// ask — human-in-the-loop clarification tool (pi-pocket choice-card
// pattern, phase "ask tool with choice cards").
//
// The model calls `ask` with 1–4 questions (each optionally with fixed
// choices). The tool does NOT return to the model until the user answers:
// execute() parks a pending entry, pushes an `ask` SSE event (the card the
// client renders), and resolves the promise when POST /api/ask/answer
// (route → resolveAsk) hands in the answers. Timeout/abort resolve with a
// "no answer" note so the agent proceeds on a stated default instead of
// hanging — the tool never blocks a run forever.
//
// Scope: one pending-map per user scope. Widget visitors get no ask tool
// (the embed renders no cards — ctxFor wires it for the main app only).
// Schema is a hand-written TSchema (plain JSON Schema) — no TypeBox
// dependency for one tool.
// ════════════════════════════════════════════════════════════════════
import crypto from 'node:crypto'

const DEFAULT_TIMEOUT_MS = 10 * 60_000
const pending = new Map() // scope → Map(id → { resolve, timer })

const questionSchema = {
  type: 'object',
  properties: {
    question: { type: 'string', description: 'The question to ask the user.' },
    choices: {
      type: 'array',
      items: { type: 'string' },
      description: '2–6 short answer options rendered as buttons. Omit for a free-text answer.',
    },
  },
  required: ['question'],
}

export const ASK_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: questionSchema,
      minItems: 1,
      maxItems: 4,
      description: 'One to four questions. Ask ONLY when the answer changes what you do next.',
    },
  },
  required: ['questions'],
}

function cleanup(scope, id, entry) {
  clearTimeout(entry.timer)
  const map = pending.get(scope)
  if (map) { map.delete(id); if (!map.size) pending.delete(scope) }
}

export function createAskTool(scope, bus, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return {
    name: 'ask',
    label: 'Ask the user',
    description:
      'Ask the user 1–4 clarifying questions, each optionally with fixed choices, rendered as ' +
      'choice cards in the UI. The run PAUSES until the user answers (or the question times out). ' +
      'Use it when a decision is genuinely the user\u2019s to make — not for facts you can look up.',
    parameters: ASK_SCHEMA,
    async execute(_toolCallId, params, signal) {
      const questions = (Array.isArray(params?.questions) ? params.questions : [])
        .slice(0, 4)
        .map(q => ({
          question: String(q?.question || '').trim(),
          choices: Array.isArray(q?.choices) ? q.choices.map(c => String(c)).filter(Boolean).slice(0, 6) : [],
        }))
        .filter(q => q.question)
      if (!questions.length) {
        return { content: [{ type: 'text', text: 'ask: no valid question provided.' }], details: { answered: false } }
      }
      const id = crypto.randomUUID()
      bus.push('ask', { id, questions }) // the client card
      const answer = await new Promise(resolve => {
        const entry = { resolve, timer: null }
        entry.timer = setTimeout(() => { cleanup(scope, id, entry); resolve({ status: 'timeout' }) }, timeoutMs)
        if (!pending.has(scope)) pending.set(scope, new Map())
        pending.get(scope).set(id, entry)
        signal?.addEventListener('abort', () => { cleanup(scope, id, entry); resolve({ status: 'aborted' }) }, { once: true })
      })
      const text = answer.status
        ? `(ask: ${answer.status} — the user did not answer. Proceed with the most reasonable default and state it.)`
        : 'User answered:\n' + answer.answers.map((a, i) => `${i + 1}. ${questions[i].question} → ${a}`).join('\n')
      return { content: [{ type: 'text', text }], details: { id, answered: !answer.status } }
    },
  }
}

/** Hand the user's answers to a parked ask (route: POST /api/ask/answer). */
export function resolveAsk(scope, id, answers) {
  const entry = pending.get(scope)?.get(id)
  if (!entry) return false
  cleanup(scope, id, entry)
  entry.resolve({ answers: (Array.isArray(answers) ? answers : []).map(a => String(a)) })
  return true
}

/** Run aborted — every parked ask of this scope resolves immediately. */
export function abortAsks(scope) {
  const map = pending.get(scope)
  if (!map) return 0
  let n = 0
  for (const [id, entry] of map) { cleanup(scope, id, entry); entry.resolve({ status: 'aborted' }); n++ }
  return n
}

export function _resetAskForTest() {
  for (const [scope, map] of pending) for (const [id, entry] of map) cleanup(scope, id, entry)
}
export const pendingAskCount = (scope) => pending.get(scope)?.size || 0
