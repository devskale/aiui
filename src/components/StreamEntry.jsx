// ════════════════════════════════════════════════════════════════════
// StreamEntry — renders a single stream entry (user, assistant, error)
// Tool calls rendered pi-TUI-style: icon + name + args, expandable output
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Tool labels (monochrome, no emoji) ──
function getToolLabel(name, args) {
  const lower = (name || '').toLowerCase()
  if (lower.includes('bash')) return args?.command ? `$ ${args.command.slice(0, 80)}` : ''
  if (lower.includes('read') || lower.includes('write') || lower.includes('edit'))
    return formatPath(args?.file_path || args?.path)
  if (lower.includes('grep')) return args?.pattern || ''
  if (lower.includes('find') || lower.includes('glob')) return args?.pattern || ''
  if (lower.includes('ls')) return formatPath(args?.path)
  return ''
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

// ── ToolGroup — dim tool calls, connected by left border, no header ──
function ToolGroup({ toolCalls }) {
  return (
    <div className="tc-group-body">
      {toolCalls.map((tc, i) => <ToolCallDim key={i} tc={tc} />)}
    </div>
  )
}

// ── ToolCallDim — single dim tool call line with expandable output ──
function ToolCallDim({ tc }) {
  const [showOutput, setShowOutput] = useState(false)
  const args = parseArgs(tc.args)
  const label = getToolLabel(tc.name, args)
  const isError = tc.status === 'error'
  const isRunning = tc.status === 'running'
  const output = tc.output || ''
  const isBash = tc.name.toLowerCase().includes('bash')

  // One clean line: bash shows "$ cmd", others show "name detail"
  const line = isBash ? label : `${tc.name}${label ? ' ' + label : ''}`

  return (
    <div
      className={`tc-dim ${isError ? 'err' : ''} ${isRunning ? 'running' : ''}`}
      onClick={() => output && setShowOutput(!showOutput)}
    >
      <span className="tc-dim-line">{line}</span>
      {isRunning && <span className="tc-dim-running" />}
      {showOutput && output && <pre className="tc-dim-output">{output}</pre>}
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

// ── Markdown image renderer — prefixes BASE_URL so prod sub-paths (/aiui/) work ──
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '')
const mdComponents = {
  img: ({ src, alt, ...props }) => {
    const full = (src && !src.startsWith('http') && !src.startsWith('data:'))
      ? `${BASE_URL}${src.startsWith('/') ? '' : '/'}${src}`
      : src
    return <img className="md-img" src={full} alt={alt} {...props} />
  },
  // Open links in a new tab so the chat view isn't navigated away.
  a: ({ href, children, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
  ),
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
      {hasTools && <ToolGroup toolCalls={entry.toolCalls} />}
      {hasText && (
        <div className="entry-text">
          <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>{entry.text}</Markdown>
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

// ════════════════════════════════════════════════════════════════════
// ImageEntry — renders an inline image-generation result (/image command)
// entry.status: 'generating' | 'done' | 'error'
// ════════════════════════════════════════════════════════════════════
const DOWNLOAD_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>

export function ImageEntry({ entry }) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
  const resolveSrc = (url) => (url.startsWith('http') || url.startsWith('data:')) ? url : `${BASE}${url}`

  if (entry.status === 'generating') {
    return (
      <div className="entry-image">
        <div className="think-line">
          <span className="think-dot" />
          <span className="think-label">Generating image…</span>
        </div>
        <div className="image-prompt">🖼️ {entry.prompt}</div>
      </div>
    )
  }

  if (entry.status === 'error') {
    return (
      <div className="entry-image">
        <div className="think-line"><span className="think-dot" style={{ background: '#ef4444' }} /></div>
        <div className="image-prompt error">⚠️ {entry.error}</div>
      </div>
    )
  }

  return (
    <div className="entry-image">
      <div className="image-prompt">🖼️ {entry.prompt}</div>
      <div className="tc-images">
        {entry.images.map((img, i) => {
          const src = resolveSrc(img.url)
          const ext = (img.mimeType || 'image/png').split('/')[1]
          const download = () => {
            const a = document.createElement('a')
            a.href = src
            a.download = `generated-${Date.now()}-${i}.${ext}`
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
          }
          return (
            <div className="tc-image-card" key={i}>
              <img src={src} alt={entry.prompt} onClick={() => window.open(src, '_blank')} />
              <button className="tc-image-dl" title="Download" onClick={download}>{DOWNLOAD_ICON}</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
