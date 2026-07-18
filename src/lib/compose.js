// ════════════════════════════════════════════════════════════════════
// compose — pure helpers for the input composer's autocomplete menus
//
// No React. The trigger detection, text+cursor insertion math, and slash-item
// filtering that used to live inline in InputBar — exactly the fiddly, bug-prone
// parts. Tested directly; consumed by useSlashMenu / useMention.
// ════════════════════════════════════════════════════════════════════

// Host actions offered in the slash menu (not "fill" items — they trigger
// component callbacks via onHostAction rather than inserting text).
const HOST_ACTIONS = [
  { id: 'compact', command: '/compact', title: '/compact', description: 'Compact conversation context now', run: 'compact' },
  { id: 'new', command: '/new', title: '/new', description: 'Start a new chat', run: 'new' },
  { id: 'model', command: '/model', title: '/model', description: 'Change model', run: 'model' },
]

/** Detect a trailing "/query" (at start or after whitespace). Returns { query, start } | null. */
export function detectSlashTrigger(text) {
  const m = /(?:^|\s)(\/[^\s]*)$/.exec(text)
  if (!m) return null
  return { query: m[1], start: m.index + (m[0].length - m[1].length) }
}

/** Detect a trailing "@query". Returns { query, atIndex } | null. */
export function detectMentionTrigger(text) {
  const m = /(?:^|\s)@([^\s]*)$/.exec(text)
  if (!m) return null
  const query = m[1] ?? ''
  const atIndex = m.index + (m[0].length - query.length - 1)
  return { query, atIndex }
}

/** Replace the slash trigger [start .. start+query.length) with `command` + ' '. */
export function applyCommand(text, start, query, command) {
  const before = text.slice(0, start)
  const after = text.slice(start + query.length)
  const inserted = command + ' '
  return { text: before + inserted + after, cursor: before.length + inserted.length }
}

/** Replace the @mention trigger at `atIndex` with '@' + filePath + ' '. */
export function applyMention(text, atIndex, query, filePath) {
  const before = text.slice(0, atIndex)
  const after = text.slice(atIndex + 1 + query.length)
  const inserted = '@' + filePath + ' '
  return { text: before + inserted + after, cursor: before.length + inserted.length }
}

/** Build slash-menu items (host actions + skill/prompt/extension fills) filtered by `query`. */
export function buildSlashItems(query, commands) {
  const q = String(query || '').replace(/^\/+/, '').toLowerCase()
  const items = []
  for (const a of HOST_ACTIONS) {
    if (!q || a.command.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)) items.push(a)
  }
  const groups = [['skills', 'skill'], ['prompts', 'prompt'], ['extensions', 'extension']]
  for (const [key, prefix] of groups) {
    for (const c of (commands?.[key]) || []) {
      const cmd = `/${prefix}:${c.name}`
      if (!q || c.name.toLowerCase().includes(q) || cmd.toLowerCase().includes(q)) {
        items.push({ id: cmd, command: cmd, title: cmd, description: c.description, run: 'fill' })
      }
    }
  }
  return items
}

/** Rewrite a bare /skillname → /skill:skillname when it matches a known skill. */
export function rewriteSkillCommand(text, skills) {
  const match = String(text || '').match(/^\/([\w][\w-]*)/)
  if (match && (skills || []).some(s => s.name === match[1])) {
    return '/skill:' + text.slice(1)
  }
  return text
}
