import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// ─── Constants ─────────────────────────────────────────────
export const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export const MAX_IMG_SIZE = 10 * 1024 * 1024 // 10MB

export const SUGGESTIONS = [
  { title: 'Show me a code snippet', sub: "of a website's sticky header" },
  { title: 'Help me study', sub: 'vocabulary for a college entrance exam' },
  { title: 'Overcome procrastination', sub: 'give me tips' },
]

// ─── Image → data URL ─────────────────────────────────────
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMG_SIZE) return reject(new Error(`${file.name} is too large (max 10MB)`))
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

// ─── Markdown rendering ──────────────────────────────────
const mdComponents = {
  pre({ children }) {
    return <React.Fragment>{children}</React.Fragment>
  },
  code({ className, children }) {
    const lang = /language-(\w+)/.exec(className || '')?.[1]
    const code = String(children).replace(/\n$/, '')
    if (lang || code.includes('\n')) {
      return (
        <SyntaxHighlighter style={atomDark} language={lang || 'text'} PreTag="div">
          {code}
        </SyntaxHighlighter>
      )
    }
    return <code className="md-inline-code">{children}</code>
  },
  a({ children, ...props }) {
    return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>
  },
}

export function renderMd(text) {
  if (!text) return null
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {text}
    </ReactMarkdown>
  )
}
