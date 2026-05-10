import React from 'react'

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

// ─── Simple markdown → HTML ───────────────────────────────
export function renderMd(text) {
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, c) =>
    `<pre><code class="lang-${lang}">${c.trim()}</code></pre>`)
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>')
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  h = h.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
  h = h.replace(/\n/g, '<br/>')
  return React.createElement('span', { dangerouslySetInnerHTML: { __html: h } })
}
