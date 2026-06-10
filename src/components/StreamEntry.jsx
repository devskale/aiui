// ════════════════════════════════════════════════════════════════════
// StreamEntry — renders a single stream entry (user, assistant, error)
// Tool calls rendered pi-TUI-style: icon + name + args, expandable output
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Tool metadata ──
const TOOL_META = {
  bash:      { icon: '$',  color: '#eab308', label: args => args?.command ? `$ ${args.command}` : '$ ...' },
  read:      { icon: '📖', color: '#60a5fa', label: args => formatPath(args?.file_path || args?.path) },
  write:     { icon: '✏️', color: '#22c55e', label: args => formatPath(args?.file_path || args?.path) },
  edit:      { icon: '✂️', color: '#f97316', label: args => formatPath(args?.file_path || args?.path) },
  grep:      { icon: '🔍', color: '#a78bfa', label: args => args?.pattern || 'grep' },
  find:      { icon: '📁', color: '#a78bfa', label: args => args?.pattern || 'find' },
  ls:        { icon: '📂', color: '#a78bfa', label: args => formatPath(args?.path) },
  mcp:       { icon: '🔗', color: '#38bdf8', label: () => 'mcp' },
  fetch_url: { icon: '🌐', color: '#2dd4bf', label: args => args?.url || 'fetch' },
  web_search:{ icon: '🔎', color: '#2dd4bf', label: args => args?.query || 'search' },
}

function getToolMeta(name) {
  const lower = (name || '').toLowerCase()
  for (const [key, meta] of Object.entries(TOOL_META)) {
    if (lower.includes(key)) return meta
  }
  return { icon: '🔧', color: '#888', label: () => name || 'tool' }
}

function formatPath(p) {
  if (!p) return ''
  // Shorten path: keep last 2 segments
  const parts = p.split('/')
  return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : p
}

function parseArgs(args) {
  if (!args) return {}
  if (typeof args === 'object') return args
  try { return JSON.parse(args) } catch { return { raw: String(args) } }
}

// ── ThinkingBlock — simple muted one-liner, expandable ──
function ToolCall({ tc }) {
  const [expanded, setExpanded] = useState(false)
  const isError = tc.status === 'error'
  const isRunning = tc.status === 'running'
  const meta = getToolMeta(tc.name)
  const args = parseArgs(tc.args)
  const label = meta.label(args)
  const output = tc.output || ''

  return (
    <div
      className={`tc-line ${isError ? 'error' : ''} ${output ? 'clickable' : ''}`}
      onClick={() => output && setExpanded(!expanded)}
    >
      <span className="tc-dot" style={{ color: isError ? '#ef4444' : isRunning ? '#eab308' : meta.color }}>
        {isRunning ? '⋯' : isError ? '✗' : '✓'}
      </span>
      <span className="tc-name" style={{ color: meta.color }}>{tc.name}</span>
      {label && label !== tc.name && <span className="tc-detail">{label}</span>}
      {expanded && output && (
        <pre className="tc-output-inline">{output}</pre>
      )}
    </div>
  )
}

// ── ThinkingBlock — simple muted one-liner, expandable ──
function ThinkingBlock({ thinking, thinkingDone, thinkingText }) {
  const [expanded, setExpanded] = useState(false)
  const text = thinkingText || ''
  const hasText = text.trim().length > 0

  return (
    <div className={`think-line ${hasText ? 'clickable' : ''}`} onClick={() => hasText && setExpanded(!expanded)}>
      <span className={`think-dot ${thinkingDone ? 'done' : ''}`} />
      <span className="think-label">{thinkingDone ? 'Thought' : 'Thinking…'}</span>
      {expanded && hasText && <span className="think-text">{text}</span>}
    </div>
  )
}

// ── Entry Components ──

const COPY_ICON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>

export function UserEntry({ text, onCopy }) {
  return (
    <div className="entry-user">
      <div className="entry-user-bubble">{text}</div>
      {onCopy && (
        <button className="copy-entry" onClick={(e) => onCopy(e.currentTarget.parentElement)} title="Copy">
          {COPY_ICON}
        </button>
      )}
    </div>
  )
}

export function AssistantEntry({ entry, isStreaming, onCopy }) {
  const hasThinking = entry.thinking || entry.thinkingDone
  const hasTools = entry.toolCalls && entry.toolCalls.length > 0
  const hasText = entry.text && entry.text.trim()

  return (
    <div className="entry-assistant">
      {hasThinking && (
        <ThinkingBlock thinking={entry.thinking} thinkingDone={entry.thinkingDone} thinkingText={entry.thinkingText} />
      )}
      {hasTools && entry.toolCalls.map((tc, i) => <ToolCall key={i} tc={tc} />)}
      {hasText && (
        <div className="entry-text">
          <Markdown remarkPlugins={[remarkGfm]}>{entry.text}</Markdown>
          {isStreaming && <span className="entry-streaming" />}
        </div>
      )}
      {onCopy && (
        <button className="copy-entry" onClick={(e) => onCopy(e.currentTarget.parentElement)} title="Copy">
          {COPY_ICON}
        </button>
      )}
    </div>
  )}

export function ErrorEntry({ text, onCopy }) {
  return (
    <div className="entry-assistant">
      <div className="entry-tool-call error">
        <div className="tc-header">
          <span className="tc-icon">⚠️</span>
          <span className="tc-name">Error</span>
        </div>
        <div className="tc-output">{text}</div>
      </div>
      {onCopy && (
        <button className="copy-entry" onClick={(e) => onCopy(e.currentTarget.parentElement)} title="Copy">
          {COPY_ICON}
        </button>
      )}
    </div>
  )
}
