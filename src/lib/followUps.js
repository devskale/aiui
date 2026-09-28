// ════════════════════════════════════════════════════════════════════
// followUps — parse the trailing "Mögliche Vertiefungen" section out of
// a settled assistant message so the UI can render the follow-up
// questions as clickable prompts.
//
// This is the v1 bridge until the canvas panel owns a structured `next`
// (ADR-0005): display-only, client-side, replay-safe. The agent pins the
// format in agents/firmenindex/agent.md:
//
//   **Mögliche Vertiefungen**
//   - → Frage eins?
//   - → Frage zwei?
//
// Strict + degrading by design: only the LAST heading-like line counts,
// only blank lines and → items may follow it, and the section must run to
// the end of the message. Anything else → null → today's plain markdown,
// no data ever disappears from the render.
// ════════════════════════════════════════════════════════════════════

// Heading-only line: optional ## prefix, optional ** bold, optional colon
// (in either order). Nothing else may appear on the line (a prose sentence
// mentioning the words must NOT match).
const HEADING =
  /^\s*(?:#{1,6}\s+)?(?:\*\*)?\s*(?:mögliche\s+vertiefungen?|mögliche\s+folgefragen?|folgefragen)[\s:*]*$/i

// One follow-up item: optional list marker, optional ** bold, → prefix.
const ITEM = /^\s*(?:[-*•]|\d+[.)])?\s*(?:\*\*)?\s*→\s*(.+?)\s*(?:\*\*)?\s*$/

const MAX_QUESTIONS = 8

/**
 * Parse a trailing follow-up section from an assistant message.
 *
 * @param {string | null | undefined} text
 * @returns {{ bodyText: string, questions: string[] } | null}
 *   `bodyText` is the message without the section (rendered as markdown);
 *   `questions` are the stripped, clickable prompts. `null` when the text
 *   does not end in a clean follow-up section — callers fall back to
 *   rendering the full text as plain markdown.
 */
export function parseFollowUps(text) {
  if (!text || typeof text !== 'string') return null
  const lines = text.split('\n')

  // The last heading-like line anywhere in the message starts the section.
  let headingIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (HEADING.test(lines[i])) { headingIdx = i; break }
  }
  if (headingIdx === -1) return null

  // Everything after the heading must be blank or an → item, to the very
  // end — otherwise this is not the section we render interactively.
  const questions = []
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue // blank lines between items are fine
    const m = line.match(ITEM)
    if (!m) return null // prose after the section → degrade
    questions.push(m[1].trim())
  }
  if (!questions.length) return null

  // Body = everything before the heading, without the trailing separator
  // hr that only visually separated the section from the report.
  let body = lines.slice(0, headingIdx)
  while (body.length && !body[body.length - 1].trim()) body.pop()
  while (body.length && /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(body[body.length - 1])) body.pop()

  return {
    bodyText: body.join('\n').replace(/\s+$/, ''),
    questions: questions.slice(0, MAX_QUESTIONS),
  }
}
