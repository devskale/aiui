// ════════════════════════════════════════════════════════════════════
// StreamEntry — renders a single stream entry (user, assistant, error)
// Tool calls rendered pi-TUI-style: icon + name + args, expandable output
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Tool helpers (ported from pi-gui timeline-item.tsx patterns) ──
function parseArgs(args) {
  if (!args) return {}
  if (typeof args === 'object') return args
  try { return JSON.parse(args) } catch { return { raw: String(args) } }
}

function shortenPath(p) {
  const parts = p.split('/')
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p
}

function extractToolPath(args) {
  if (!args || typeof args !== 'object') return ''
  return args.file_path || args.filePath || args.path || args.filename || ''
}

function isWriteTool(name) { return /write|edit|patch|apply/i.test(name) }
function isBashTool(name) { return /bash|shell|exec|terminal|command|run/i.test(name) }
function isReadTool(name) { return /read|grep|glob|find|ls|view|search|cat/i.test(name) }

function countDiffStats(text) {
  let added = 0, removed = 0
  for (const line of text.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
  }
  return { added, removed }
}

function prettyArgs(args) {
  if (!args) return ''
  if (typeof args === 'string') {
    try { return JSON.stringify(JSON.parse(args), null, 2) } catch { return args }
  }
  return JSON.stringify(args, null, 2)
}

const GlyphFile = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>)
const GlyphTerm = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>)
const GlyphPen = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>)
const GlyphSpark = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/></svg>)

function ToolGlyph({ name }) {
  if (isWriteTool(name)) return <GlyphPen />
  if (isBashTool(name)) return <GlyphTerm />
  if (isReadTool(name)) return <GlyphFile />
  return <GlyphSpark />
}

// ── Inline diff viewer (ported from pi-gui diff-inline.tsx) ──
// Extract a unified diff from a tool result if present.
function extractDiffFromOutput(output) {
  if (typeof output === 'string' && (output.includes('@@') || output.startsWith('diff '))) return output
  if (output && typeof output === 'object') {
    if (typeof output.diff === 'string') return output.diff
    if (output.details && typeof output.details.diff === 'string') return output.details.diff
  }
  return undefined
}

function parseDiff(diff) {
  const lines = diff.split('\n')
  const result = []
  let lineNumber = 0
  for (const line of lines) {
    if (line.startsWith('@@')) {
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(line)
      lineNumber = m ? parseInt(m[1] || '0', 10) : 0
      result.push({ type: 'header', content: line })
      continue
    }
    if (line.startsWith('---') || line.startsWith('+++')) continue
    if (line.startsWith('+')) { result.push({ type: 'added', content: line.slice(1), lineNumber }); lineNumber++ }
    else if (line.startsWith('-')) { result.push({ type: 'removed', content: line.slice(1) }) }
    else if (line.startsWith(' ') || line === '') { result.push({ type: 'context', content: line.slice(1), lineNumber }); lineNumber++ }
  }
  return result
}

function InlineDiff({ diff }) {
  const lines = parseDiff(diff)
  if (!lines.length) return null
  return (
    <pre className="diff-inline">
      {lines.map((l, i) => (
        <div key={i} className={`diff-line diff-line--${l.type}`}>
          <span className="diff-line__number">{l.lineNumber !== undefined ? l.lineNumber : ''}</span>
          <span className="diff-line__content">{l.content || ' '}</span>
        </div>
      ))}
    </pre>
  )
}

// ── ToolGroup — subtle tool calls with per-tool glyph + expandable output ──
function ToolGroup({ toolCalls }) {
  return (
    <div className="tc-group-body">
      {toolCalls.map((tc, i) => <ToolCallCard key={i} tc={tc} />)}
    </div>
  )
}

// ── ToolCallCard — one tool call: glyph + name + path + status, expandable ──
function ToolCallCard({ tc }) {
  const [open, setOpen] = useState(false)
  const args = parseArgs(tc.args)
  const isWrite = isWriteTool(tc.name)
  const isBash = isBashTool(tc.name)
  const isError = tc.status === 'error'
  const isRunning = tc.status === 'running'
  const filePath = extractToolPath(args)
  const output = tc.output || ''
  const hasContent = output || (args && Object.keys(args).length > 0)
  const diffStats = isWrite && output ? countDiffStats(output) : null
  const label = isBash && args.command
    ? `$ ${args.command.length > 80 ? args.command.slice(0, 80) + '…' : args.command}`
    : filePath ? shortenPath(filePath)
    : tc.name
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(output || prettyArgs(args)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }).catch(() => {})
  }

  return (
    <div className={`tc-card ${isError ? 'err' : ''} ${isRunning ? 'running' : ''}`}>
      <div className="tc-card-head" onClick={() => hasContent && setOpen(!open)}>
        <span className="tc-glyph"><ToolGlyph name={tc.name} /></span>
        <span className="tc-name">{tc.name}</span>
        {label && <span className="tc-path">{label}</span>}
        {diffStats && (
          <span className="tc-diff-stats">
            <span className="add">+{diffStats.added}</span>{' '}
            <span className="del">-{diffStats.removed}</span>
          </span>
        )}
        <span className="tc-status">{isRunning ? 'running' : isError ? 'failed' : 'done'}</span>
        {hasContent && (
          <button
            className="tc-copy"
            onClick={(e) => { e.stopPropagation(); copy() }}
            title="Copy"
          >{copied ? 'copied' : 'copy'}</button>
        )}
        {isRunning && <span className="tc-running" />}
      </div>
      {open && hasContent && (
        <div className="tc-card-body">
          {args && Object.keys(args).length > 0 && (
            <pre className="tc-args">{prettyArgs(args)}</pre>
          )}
          {output && (isWrite && extractDiffFromOutput(output)
            ? <InlineDiff diff={extractDiffFromOutput(output)} />
            : <pre className="tc-output">{output}</pre>)}
        </div>
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

// ── Markdown image renderer — prefixes BASE_URL so prod sub-paths (/aiui/) work ──
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '')

// Walk a react-markdown code node to recover its raw text (for copy)
function extractCodeText(node) {
  if (node == null) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractCodeText).join('')
  if (node.props) return extractCodeText(node.props.children)
  return ''
}

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
  // Code block: language label + copy button in a header bar
  pre: ({ children }) => {
    const codeEl = Array.isArray(children) ? children[0] : children
    const className = codeEl?.props?.className || ''
    const langMatch = /language-([\w+#-]+)/.exec(className)
    const lang = langMatch?.[1]
    const raw = extractCodeText(codeEl?.props?.children)
    const [copied, setCopied] = useState(false)
    const copy = () => {
      navigator.clipboard.writeText(raw).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }).catch(() => {})
    }
    return (
      <div className="md-codeblock">
        <div className="md-codeblock-head">
          <span className="md-codeblock-lang">{lang || 'code'}</span>
          <button className="md-codeblock-copy" onClick={copy} title="Copy code">
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
        <pre>{children}</pre>
      </div>
    )
  },
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
  const thinkingText = entry.thinkingText || ''
  const hasThinkingText = thinkingText.trim().length > 0
  // Live entry: phase flags (reducer-owned) drive the indicator.
  // Committed entry: derive from thinkingText — a historical row is always 'done'.
  const showThinking = isStreaming
    ? (entry.thinking || entry.thinkingDone)
    : hasThinkingText
  const thinkingDone = isStreaming ? entry.thinkingDone : true
  const hasTools = entry.toolCalls && entry.toolCalls.length > 0
  const hasText = entry.text && entry.text.trim()

  return (
    <div className="entry-assistant">
      {showThinking && (
        <ThinkingBlock thinking={entry.thinking} thinkingDone={thinkingDone} thinkingText={thinkingText} />
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
