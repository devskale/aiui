// ════════════════════════════════════════════════════════════════════
// StreamEntry — renders a single stream entry (user, assistant, error)
// ════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const TOOL_ICONS = {
  bash: '⚡',
  read: '📖',
  write: '✏️',
  edit: '✂️',
  mcp: '🔗',
  fetch_url: '🌐',
  web_search: '🔍',
  default: '🔧',
}

function getToolIcon(name) {
  const lower = (name || '').toLowerCase()
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon
  }
  return TOOL_ICONS.default
}

function ToolCall({ tc }) {
  const [expanded, setExpanded] = useState(false)
  const isError = tc.status === 'error'
  const isRunning = tc.status === 'running'

  return (
    <div className={`entry-tool-call ${isError ? 'error' : ''}`} onClick={() => setExpanded(!expanded)}>
      <div className="tc-header">
        <span className="tc-icon">{getToolIcon(tc.name)}</span>
        <span className="tc-name">{tc.name}</span>
        <span className={`tc-status ${isError ? 'err' : isRunning ? 'running' : 'ok'}`}>
          {isRunning ? '⋯' : isError ? '✗' : '✓'}
        </span>
      </div>
      {tc.args && <div className="tc-args">{truncate(tc.args, 120)}</div>}
      {expanded && tc.output && <div className="tc-output">{tc.output}</div>}
    </div>
  )
}

function truncate(s, len) {
  if (!s) return ''
  s = typeof s === 'string' ? s : JSON.stringify(s)
  return s.length > len ? s.slice(0, len) + '…' : s
}

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
        <div className="entry-thinking">
          <span className={`thinking-dot ${entry.thinkingDone ? 'done' : ''}`} />
          <span>{entry.thinkingDone ? 'Thought' : 'Thinking…'}</span>
        </div>
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
