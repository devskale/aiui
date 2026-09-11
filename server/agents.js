// ════════════════════════════════════════════════════════════════════
// agents — the Agent catalog (ADR-0004)
//
// An Agent is a repo-shipped preset: a persona (the agent.md body becomes
// the session's system prompt via the loader's `systemPrompt` seam) plus
// optional carried Skills (skills/ dir) and Extension tools (extensions/
// *.js), passed to the SDK loader as additional paths. Agent-carried
// resources are deployment-curated product presets — the same stance as
// the seeded baseline skills — and do NOT go through per-User entitlement
// (default-deny stays for user-level resources; ADR-0001 is untouched).
//
//   agents/<id>/agent.md     frontmatter: name, description, model?,
//                            stt?, sttLanguage? — body = system prompt
//   agents/<id>/skills/      skill dirs (SKILL.md each), loaded additively
//   agents/<id>/extensions/  *.js extension modules, loaded additively
//
// The implicit `default` agent is the slim πui assistant (ADR-0003).
// ════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFrontmatter } from '@earendil-works/pi-coding-agent'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AGENTS_ROOT = path.join(__dirname, '..', 'agents')

// Slim, web-chat-shaped system message (ADR-0003). Replaces pi's CLI-oriented
// default persona. Skills, project context files, and cwd are appended
// automatically by the SDK (this string becomes buildSystemPrompt's
// customPrompt, which preserves them).
export const SLIM_SYSTEM_PROMPT = `You are a helpful coding and general-purpose assistant in \u03c0ui, a web-based chat interface. You operate inside the user's workspace and can read files, run commands, edit code, and write new files.

Tools available: read, bash, edit, write \u2014 plus any extension or skill tools the user has enabled.

Guidelines:
- Be concise and direct in your responses.
- Show file paths clearly when working with files.
- Use bash for exploration (ls, rg, find) and shell commands.
- Prefer precise edits over full rewrites.`

// The implicit baseline agent: today's behavior, unchanged.
export const DEFAULT_AGENT = {
  id: 'default',
  name: 'Assistant',
  description: 'General-purpose coding and chat assistant',
  systemPrompt: SLIM_SYSTEM_PROMPT,
  skillPaths: [],
  extensionPaths: [],
  model: null,
  stt: false,
  sttLanguage: 'auto',
  tts: false,
}

// ── Catalog loading (once at startup; edits need a service restart) ──

function loadOneAgent(id) {
  const dir = path.join(AGENTS_ROOT, id)
  const file = path.join(dir, 'agent.md')
  if (!fs.existsSync(file)) return null
  let raw
  try { raw = fs.readFileSync(file, 'utf8') } catch { return null }
  const { frontmatter, body } = parseFrontmatter(raw) || {}
  const content = (body || '').trim()
  if (!frontmatter?.name || !content) return null

  const agent = {
    id,
    name: String(frontmatter.name),
    description: String(frontmatter.description || ''),
    systemPrompt: content,
    model: frontmatter.model ? String(frontmatter.model) : null,
    stt: frontmatter.stt === true,
    sttLanguage: frontmatter.sttLanguage ? String(frontmatter.sttLanguage) : 'auto',
    tts: frontmatter.tts === true,
    skillPaths: [],
    extensionPaths: [],
  }

  const skillsDir = path.join(dir, 'skills')
  if (fs.existsSync(skillsDir)) agent.skillPaths.push(skillsDir)

  const extDir = path.join(dir, 'extensions')
  if (fs.existsSync(extDir)) {
    const paths = []
    for (const entry of fs.readdirSync(extDir, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
        paths.push(path.join(extDir, entry.name))
      } else if (entry.isDirectory()) {
        // Dir-style extension: <name>/index.js
        const idx = ['index.js', 'index.ts']
          .map(f => path.join(extDir, entry.name, f))
          .find(p => fs.existsSync(p))
        if (idx) paths.push(idx)
      }
    }
    agent.extensionPaths = paths
  }
  return agent
}

let catalog = null
function loadCatalog() {
  const agents = [DEFAULT_AGENT]
  let ids = []
  try { ids = fs.readdirSync(AGENTS_ROOT, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch {}
  for (const id of ids.sort()) {
    const agent = loadOneAgent(id)
    if (agent) agents.push(agent)
  }
  return agents
}

function allAgents() {
  if (!catalog) catalog = loadCatalog()
  return catalog
}

/** Catalog for the UI: metadata only, no prompt bodies. */
export function listAgents() {
  return allAgents().map(({ id, name, description, model, stt, sttLanguage, tts }) =>
    ({ id, name, description, model, stt, sttLanguage, tts }))
}

/** Full Agent def by id. Unknown/absent ids fall back to the default. */
export function getAgent(id) {
  if (!id || id === DEFAULT_AGENT.id) return DEFAULT_AGENT
  return allAgents().find(a => a.id === id) || DEFAULT_AGENT
}

/** Strict lookup for route validation — throws on unknown ids. */
export function requireAgent(id) {
  if (!id || id === DEFAULT_AGENT.id) return DEFAULT_AGENT
  const agent = allAgents().find(a => a.id === id)
  if (!agent) throw new Error(`Unknown agent: ${id}`)
  return agent
}

/**
 * Read roots for Agent-carried skills across ALL agents (union). The sandbox
 * allow-lists these (like the per-user agentDir resource subdirs) so the
 * agent's read tool can load a carried SKILL.md — repo-shipped product
 * content, same trust level as seeded package skills (ADR-0004).
 */
export function carriedResourceRoots() {
  return allAgents().flatMap(a => a.skillPaths)
}
