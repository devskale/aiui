// ════════════════════════════════════════════════════════════════════
// StreamEntry — renders a single stream entry (user, assistant, error)
// Tool calls rendered pi-TUI-style: icon + name + args, expandable output
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Tool metadata ──
const TOOL_META = {
  bash:      { icon: '$',  color: '#eab308', label: cmd => cmd ? `$ ${cmd}` : '$ ...' },
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

function truncateOutput(text, maxLines = 12) {
  if (!text) return { preview: '', truncated: 0, total: 0 }
  const lines = text.split('\n')
  const total = lines.length
  if (total <= maxLines) return { preview: text, truncated: 0, total }
  return {
    preview: lines.slice(0, maxLines).join('\n'),
    truncated: total - maxLines,
    total,
  }
}

// ── ToolCall Component ──
function ToolCall({ tc }) {
  const [expanded, setExpanded] = useState(false)
  const isError = tc.status === 'error'
  const isRunning = tc.status === 'running'
  const meta = getToolMeta(tc.name)
  const args = parseArgs(tc.args)

  // Build label
  const label = meta.label(args)

  // Format output for display
  const output = tc.output || ''
  const { preview, truncated, total } = truncateOutput(expanded ? output : output, expanded ? Infinity : 10)

  return (
    <div
      className={`entry-tool-call ${isError ? 'error' : ''}`}
      onClick={() => output && setExpanded(!expanded)}
      style={{ borderLeftColor: isError ? '#ef4444' : isRunning ? '#eab308' : meta.color }}
    >
      <div className="tc-header">
        <span className="tc-tool-name" style={{ color: meta.color }}>{tc.name}</span>
        <span className="tc-label">{label !== tc.name ? label : ''}</span>
        {isRunning && <span className="tc-status running">⋯</span>}
        {!isRunning && !isError && <span className="tc-status ok">✓</span>}
        {isError && <span className="tc-status err">✗</span>}
      </div>

      {/* Show compact args for some tools */}
      {tc.name?.toLowerCase().includes('bash') && args.command && (
        <div className="tc-args">$ {args.command}</div>
      )}

      {/* Output */}
      {output && (
        <div className="tc-output">
          <pre style={{ margin: 0, fontSize: '12px', color: '#999', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {expanded ? output : preview}
          </pre>
          {truncated > 0 && !expanded && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: 4, cursor: 'pointer' }}>
              … {truncated} more lines (click to expand)
            </div>
          )}
          {expanded && truncated > 0 && (
            <div style={{ fontSize: '11px', color: '#555', marginTop: 4, cursor: 'pointer' }}>
              ↑ click to collapse ({total} lines)
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── ThinkingBlock — pi-TUI style: italic muted text, expandable ──
function ThinkingBlock({ thinking, thinkingDone, thinkingText }) {
  const [expanded, setExpanded] = useState(false)
  const text = thinkingText || ''
  if (!text.trim()) {
    return (
      <div className="entry-thinking">
        <span className={`thinking-dot ${thinkingDone ? 'done' : ''}`} />
        <span className="thinking-label">{thinkingDone ? 'Thought' : 'Thinking…'}</span>
      </div>
    )
  }

  const lines = text.split('\n')
  const PREVIEW_LINES = 3
  const needsCollapse = lines.length > PREVIEW_LINES

  return (
    <div className="thinking-block" onClick={() => setExpanded(!expanded)}>
      <div className="thinking-header">
        <span className={`thinking-dot ${thinkingDone ? 'done' : ''}`} />
        <span className="thinking-label">{thinkingDone ? 'Thought' : 'Thinking…'}</span>
        {needsCollapse && <span className="thinking-toggle">{expanded ? '↑' : `+${lines.length - PREVIEW_LINES} lines`}</span>}
      </div>
      <div className="thinking-content">
        {expanded ? text : lines.slice(0, PREVIEW_LINES).join('\n')}
        {!expanded && needsCollapse && '…'}
      </div>
    </div>
  )
}

// ── Entry Components ──

export function UserEntry({ text }) {
  return (
    <div className="entry-user">
      <div className="entry-user-bubble">{text}</div>
    </div>
  )
}

export function AssistantEntry({ entry, isStreaming }) {
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
    </div>
  )
}

export function ErrorEntry({ text }) {
  return (
    <div className="entry-assistant">
      <div className="entry-tool-call error">
        <div className="tc-header">
          <span className="tc-icon">⚠️</span>
          <span className="tc-name">Error</span>
        </div>
        <div className="tc-output">{text}</div>
      </div>
    </div>
  )
}
