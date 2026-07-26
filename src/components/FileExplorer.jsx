// ════════════════════════════════════════════════════════════════════
// FileExplorer — browse + view files in the user's workspace (G5).
//
// Lean navigator: a breadcrumb + one directory level at a time (click a dir
// to descend, .. to ascend). Clicking a file shows its content inline
// (text in a <pre>, images via the raw endpoint). All paths are
// workspace-scoped server-side (assertInside), so this can't read outside it.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import { apiUrl } from '../lib/api'

const IMG_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i

export function FileExplorer({ onClose }) {
  const [dir, setDir] = useState('')        // current relative dir ('' = root)
  const [entries, setEntries] = useState(null)
  const [file, setFile] = useState(null)    // { path, name } when viewing
  const [content, setContent] = useState(null)
  const [error, setError] = useState(null)

  const loadDir = useCallback(async (d) => {
    setFile(null); setContent(null); setError(null)
    try {
      const r = await fetch(apiUrl(`/api/tree?path=${encodeURIComponent(d)}`))
      if (!r.ok) throw new Error('load failed')
      setEntries(await r.json())
    } catch { setEntries([]) }
  }, [])

  useEffect(() => { loadDir(dir) }, [dir, loadDir])

  const openFile = async (name) => {
    const p = dir ? `${dir}/${name}` : name
    setFile({ path: p, name }); setContent(null); setError(null)
    if (IMG_RE.test(name)) return // images load straight from /api/file/raw
    try {
      const r = await fetch(apiUrl(`/api/file?path=${encodeURIComponent(p)}`))
      setContent(await r.json())
    } catch { setError('load failed') }
  }

  const segments = dir ? dir.split('/') : []

  return (
    <div className="overlay" onClick={onClose}>
      <div className="file-explorer" onClick={e => e.stopPropagation()}>
        <header className="fe-header">
          <h2>Files</h2>
          <div className="fe-crumb">
            <button className="fe-crumb-item" onClick={() => { setDir(''); setEntries(null) }}>workspace</button>
            {segments.map((seg, i) => (
              <span key={i}>
                <span className="fe-crumb-sep">/</span>
                <button className="fe-crumb-item" onClick={() => setDir(segments.slice(0, i + 1).join('/'))}>{seg}</button>
              </span>
            ))}
          </div>
          <button className="sp-close" onClick={onClose}>✕</button>
        </header>

        <div className="fe-body">
          {file ? (
            <div className="fe-viewer">
              <div className="fe-viewer-bar">
                <button className="fe-back" onClick={() => loadDir(dir)}>← back</button>
                <span className="fe-viewer-path">{file.path}</span>
              </div>
              {error && <div className="fe-empty">{error}</div>}
              {IMG_RE.test(file.name) ? (
                <img className="fe-img" src={apiUrl(`/api/file/raw?path=${encodeURIComponent(file.path)}`)} alt={file.name} />
              ) : content === null ? (
                <div className="fe-empty">Loading…</div>
              ) : content.tooLarge ? (
                <div className="fe-empty">File is {Math.round(content.size / 1024)}KB — too large to preview (1MB limit).</div>
              ) : content.error ? (
                <div className="fe-empty">{content.error}</div>
              ) : (
                <pre className="fe-content">{content.content}</pre>
              )}
            </div>
          ) : entries === null ? (
            <div className="fe-empty">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="fe-empty">No files</div>
          ) : (
            <ul className="fe-list">
              {dir && (
                <li><button className="fe-entry fe-entry--dir" onClick={() => setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '')}>📁 ..</button></li>
              )}
              {entries.map(e => (
                <li key={e.name}>
                  <button
                    className={`fe-entry ${e.dir ? 'fe-entry--dir' : 'fe-entry--file'}`}
                    onClick={() => e.dir ? setDir(dir ? `${dir}/${e.name}` : e.name) : openFile(e.name)}
                  >
                    {e.dir ? '📁' : '📄'} {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
