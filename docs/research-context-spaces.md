# Research: How SOTA tools structure "context spaces"

**Date:** 2026-09 · **Status:** research / design input
**Question:** How do Claude Code, Claude Cowork/Projects, and the Claude
Memory tool structure their persistent context / "context spaces" — and what
should aiui's **Blackboard** idea learn from them?

This is primary-source research (official Anthropic docs + source), captured
here so the Blackboard idea can be designed against real SOTA patterns rather
than reinvented. The Blackboard idea lives in [`ideas.md`](./ideas.md), §16.

---

## The core mental model: "memory is just text, re-read every session"

The single most important SOTA insight, repeated across every source:

> LLMs do not remember anything. Every new conversation starts from zero.
> Persistent "memory" is **Markdown files that get re-injected into the
> context window at the start of every session.**

There is no magic database, no hidden internal state. Claude Code, Cowork,
and the Memory tool all implement the same primitive: **a directory of
Markdown files that the agent reads/writes, loaded on a schedule (at session
start, or on demand).**

Why Markdown specifically:
- Clear hierarchy via headers/subheaders — LLMs exploit structure well
- Lists, bold, italics signal emphasis
- Separates concerns without verbosity
- Humans can read/edit it in any editor, diff it with git, preview rendered

**Design implication for aiui:** a "context space" / Blackboard is not a novel
storage mechanism — it's a **well-governed Markdown file (or directory) with
clear rules about who writes, what loads when, and what gets pruned.**

---

## Pattern 1 — Claude Code: layered Markdown memory (CLAUDE.md + Auto memory)

Two complementary systems, both loaded at session start as *context* (not
enforced config):

| | CLAUDE.md | Auto memory |
|---|---|---|
| Who writes it | You | Claude |
| What it contains | Instructions & rules | Learnings & patterns |
| Scope | Project, user, org | Per repository (shared across worktrees) |
| Loaded into | Every session | Every session |
| Size cap | ~200 lines/file | First 200 lines or 25KB of MEMORY.md |

**The layering (load order, broadest → most specific):**
1. **Managed policy** — `/Library/Application Support/ClaudeCode/CLAUDE.md` — org-wide, IT-managed
2. **User instructions** — `~/.claude/CLAUDE.md` — personal, all projects
3. **Project instructions** — `./CLAUDE.md` or `./.claude/CLAUDE.md` — team-shared via git
4. **Local instructions** — `./CLAUDE.local.md` — personal project prefs, gitignored

All discovered files are **concatenated** (not overriding), ordered root→cwd.
Nested subdirectory CLAUDE.md files load **on demand** when Claude reads files
in those subdirectories.

**Key governance rules worth stealing:**
- **Size discipline:** target <200 lines/file. Long files consume context and
  reduce adherence. When a file grows, split into path-scoped rules.
- **`@path` imports:** CLAUDE.md can import other files (`@README`) which are
  expanded at launch. Max 4 hops deep. Wrapping a path in backticks keeps it
  literal (no import).
- **Path-scoped rules (`.claude/rules/`):** one-topic Markdown files with YAML
  `paths:` frontmatter (glob patterns). Load **only when** Claude works with
  matching files — reduces noise, saves context. This is the key scaling
  mechanism for large context.
- **HTML comments stripped:** `<!-- maintainer notes -->` are removed before
  injection — leave notes for humans without spending context tokens.
- **`/context` command:** inspect exactly what's loaded and what's using space.
- **Compaction:** when context fills, Claude clears older tool outputs first,
  then summarizes. Persistent rules must live in CLAUDE.md, not history.

---

## Pattern 2 — Claude Cowork / Projects: the "project" as a context space

Cowork is Anthropic's agentic desktop app. Its **Project** is the closest
thing to a "context space" container — and it's the model aiui should study
most closely for the Blackboard.

**A Cowork project bundles:**
| Item | Purpose |
|---|---|
| Description | What the project is for; Dispatch reads it when routing tasks |
| Folders | One+ local folders Claude can read/write inside the project's sessions |
| Instructions | Standing guidance applied to **every** session in the project |
| Links | Reference URLs Claude can consult |
| Projects from Chat | claude.ai project knowledge it can draw on |
| **Memory** | A **project-scoped memory store** that persists across sessions |

**Key properties:**
- Projects live **on your computer** — not synced, not shared (vs claude.ai
  projects which are account-level and shareable on Team/Enterprise).
- The project is the **unit of recurring work**: folders mounted + instructions
  applied → Claude starts already set up.
- **What Claude learns during a session is saved to the project's memory for
  next time.** This is the feedback loop that makes a context space compound.
- Archive removes metadata (name, instructions, links, memory) but **never
  touches the attached local folders** — files stay on disk.
- Dispatch can route background tasks into a project, inheriting its folders,
  instructions, and memory.

**Design implication for aiui:** a context space should be **project-scoped**
(a named container bundling instructions + folders + memory), not a single
global scratchpad. The Blackboard is best modeled as *one project-scoped
memory store + standing instructions + mounted workspace folder*.

---

## Pattern 3 — Claude Memory tool (client-side, on-demand)

The Memory tool (all Claude 4+ models) is the purest primitive:
- Claude stores/retrieves info in a directory of memory files under `/memories`.
- **Just-in-time retrieval:** Claude checks memory before starting a task,
  reads relevant files on demand, keeps the active context focused. It does
  **not** load everything up front.
- **Client-side:** Claude requests file ops; *your application* executes them
  against storage you control (per-user directory, DB, encrypted files). You
  own where/how it's stored.
- **Security:** all operations restricted to `/memories` (path-traversal
  protection) — a hard sandbox boundary around the memory store.

**Design implication for aiui:** the Blackboard should be backed by aiui's
server (client-side execution), restricted to the user's workspace, with
path-traversal guards — exactly parallel to aiui's existing Sandbox +
`assertInside` pattern. The storage is a per-user Markdown file aiui owns.

---

## Pattern 4 — Claude Code Auto memory (self-writing, capped)

Auto memory is Claude writing its own notes (MEMORY.md) based on corrections
and preferences. Key facts:
- Loads first **200 lines or 25KB** at session start.
- **Silently truncates at 200 lines with no warning** — a known sharp edge.
- It's "best effort" — not the place for critical, must-always-apply rules
  (those go in CLAUDE.md).
- Subagents can maintain their own auto memory (persistent memory per subagent).

**Design implication for aiui:** if the agent auto-writes to the Blackboard,
**cap its size** (e.g. 200 lines / 25KB) and treat it as best-effort context,
not authoritative config. Prefer explicit "write this down" tool calls over
silent auto-appends.

---

## Cross-cutting SOTA principles for structuring context spaces

Synthesized from all four patterns:

1. **Markdown files as the substrate.** Plain text, re-read every session.
   No magic DB. Humans can edit/diff/render it.

2. **Layered, scoped files — not one blob.** Global / user / project / local.
   Load order matters (broadest → most specific). Concatenate, don't override.

3. **On-demand loading is the scaling lever.** Don't load everything up front.
   Path-scoped rules, just-in-time memory reads, on-demand skills. Keep the
   active context focused on the current task.

4. **A hard size discipline.** ~200 lines / 25KB caps. Long files reduce
   adherence and consume context. Prune aggressively; treat memory as
   best-effort.

5. **A feedback loop that compounds.** What the agent learns during a session
   is written back to project memory for next time — so the context space
   grows more useful over sessions, not just accumulates.

6. **The agent writes its own notes, but the app owns the store.** Client-side
   execution: the agent requests ops, the app enforces the boundary (sandbox,
   path traversal), controls storage, and can cap/prune.

7. **Separation of "instructions" from "memory".** Instructions = standing
   rules (CLAUDE.md, project Instructions) that always load. Memory = learnings
   (auto memory, project memory store) that load on demand or capped. Don't
   conflate the two.

8. **Context is not enforced config.** Memory guides but doesn't block. To
   *block* an action, use a hook/guard, not a memory file.

9. **Files and memory are decoupled from project metadata.** Archiving a
   project removes its metadata + memory but never deletes the user's actual
   files on disk.

---

## What this means for aiui's Blackboard

Mapping SOTA → aiui's existing architecture:

| SOTA concept | aiui equivalent today | What to add |
|---|---|---|
| Project-scoped context space | per-User workspace (`workspace/<user>/`) | a named **Blackboard** (per User, maybe per project) |
| Markdown substrate | `workspace-files.js` already handles files | `workspace/<user>/blackboard.md` as source of truth |
| Standing instructions | — | a `blackboard/instructions.md` (or frontmatter) always loaded |
| Project memory store | — | `blackboard/memory.md` capped (~200 lines), agent-written |
| Client-side execution + sandbox | `server/sandbox.js` + `assertInside` | agent gets a `blackboard_read`/`blackboard_write` tool, guarded by `assertInside` |
| Live sync | `server/event-bus.js` (SSE) | broadcast blackboard edits to open clients |
| On-demand loading | — | load memory.md on demand / capped; instructions always |
| Editability | — | user edits blackboard.md in the UI (like Cowork's editable memory) |

**Recommended design (SOTA-consistent):**
- **One Blackboard per User** (not per project) for v1 — simplest, matches
  aiui's one-live-session-per-user model. Per-project is a later refinement.
- A single `workspace/<user>/blackboard.md` Markdown file, editable by both
  the user (in the UI) and the agent (via a sandbox-guarded tool).
- **Two logical sections** in one file, mirroring SOTA's instructions/memory
  split: a top `## Instructions` block (standing, always loaded) and a
  `## Working notes` block (agent-written, capped, best-effort).
- **Cap the size** (~200 lines / 25KB) to protect context; provide a prune
  affordance in the UI.
- **Live sync via the existing Event bus** so both the user and the agent see
  edits in real time — this is what makes it a *shared blackboard* rather than
  a file.
- **Sandbox-guarded tools** (`assertInside`) so the agent can only touch its
  own user's blackboard — reuses aiui's default-deny entitlement.

**Open questions (design decisions, not blockers):**
- One Blackboard per User vs per project/session? (Recommend per-User v1.)
- Conflict resolution when user and agent edit simultaneously? (Recommend
  last-write-wins + live SSE broadcast for v1; versioned history later.)
- Should the blackboard be inside the agent's sandbox scope (agent can write)
  or outside (only user + a dedicated tool writes)? (Recommend a dedicated
  tool so aiui controls writes, not the general file sandbox.)
- Does the Blackboard persist across sessions, or reset per session?
  (Recommend persist — that's the whole point of a context space.)

---

## Sources (primary)

- Claude Code Docs — *How Claude remembers your project* (memory):
  https://code.claude.com/docs/en/memory
- Claude Code Docs — *How Claude Code works* (context window, compaction,
  sessions, auto memory): https://code.claude.com/docs/en/how-claude-code-works
- Claude.ai Docs — *Organize work with projects* (Cowork):
  https://claude.com/docs/cowork/guide/projects
- Claude Platform Docs — *Memory tool* (client-side, `/memories`, on-demand):
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- Cowork Insider — *How Claude Cowork Memory Works* (editable memory file,
  manage edits): https://www.coworkinsider.com/learn/memory/
- José Parreño García — *Claude Code Memory Explained* (memory-as-text mental
  model): https://joseparreogarcia.substack.com/p/claude-code-memory-explained
- Anthropic — *Effective context engineering for AI agents* (referenced by the
  Memory tool docs): https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
