// ════════════════════════════════════════════════════════════════════
// FileExplorer — browse + view files in the user's workspace (G5).
//
// Lean navigator: a breadcrumb + one directory level at a time (click a dir
// to descend, .. to ascend). Clicking a file shows its content inline
// (text in a <pre>, images via the raw endpoint). All paths are
// workspace-scoped server-side (assertInside), so this can't read outside it.
// ════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef } from 'react'
import { apiUrl } from '../lib/api'
import { useEscape } from '../hooks/useEscape'
import { UploadCloud, Folder, File as FileIcon } from 'lucide-react'

export function FileExplorer({ onClose }) {
  useEscape(onClose)
  const [dir, setDir] = useState('')        // current relative dir ('' = root)
  const [entries, setEntries] = useState(null)
  const [file, setFile] = useState(null)    // { path, name, isImage } when viewing
  const [content, setContent] = useState(null)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const loadDir = useCallback(async (d) => {
    setFile(null); setContent(null); setError(null)
    try {
      const r = await fetch(apiUrl(`/api/tree?path=${encodeURIComponent(d)}`))
      if (!r.ok) throw new Error('load failed')
      setEntries(await r.json())
    } catch {
      setEntries(null)
      setError('folder could not be loaded')
    }
  }, [])

  useEffect(() => { loadDir(dir) }, [dir, loadDir])

  // Upload into the currently-browsed folder, then refresh the listing. The
  // response is ignored server-side (no dataUrl round-trip); failures are
  // counted so a rejected file doesn't masquerade as success.
  const uploadFiles = useCallback(async (fileList) => {
    if (!fileList || !fileList.length) return
    setUploading(true)
    let failed = 0
    try {
      for (const file of fileList) {
        const fd = new FormData()
        fd.append('files', file)
        try {
          const r = await fetch(apiUrl(`/api/upload?dir=${encodeURIComponent(dir)}`), { method: 'POST', body: fd })
          if (!r.ok) failed++
        } catch { failed++ }
      }
      await loadDir(dir)
      if (failed) setError(`upload failed for ${failed} of ${fileList.length} file(s)`)
    } finally {
      setUploading(false)
    }
  }, [dir, loadDir])

  const openFile = (entry) => {
    const p = dir ? `${dir}/${entry.name}` : entry.name
    setFile({ path: p, name: entry.name, isImage: !!entry.isImage, contentType: entry.contentType || null })
    setContent(null); setError(null)
    if (entry.isImage || entry.contentType === 'application/pdf') return // render straight from /api/file/raw
    loadText(p)
  }

  const loadText = async (p) => {
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
          <input ref={fileInputRef} type="file" multiple className="fe-file-input" onChange={e => { uploadFiles(e.target.files); e.target.value = '' }} />
          <button className="fe-upload" onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Upload to this folder">
            <UploadCloud size={14} strokeWidth={2} /> {uploading ? 'Uploading…' : 'Upload'}
          </button>
          <button className="sp-close" onClick={onClose}>✕</button>
        </header>

        <div className={`fe-body ${dragOver ? 'drag-over' : ''}`} onDragOver={e => { if (!file) { e.preventDefault(); setDragOver(true) } }} onDragLeave={() => setDragOver(false)} onDrop={e => { setDragOver(false); if (file) return; e.preventDefault(); uploadFiles(e.dataTransfer?.files) }}>
          {file ? (
            <div className="fe-viewer">
              <div className="fe-viewer-bar">
                <button className="fe-back" onClick={() => loadDir(dir)}>← back</button>
                <span className="fe-viewer-path">{file.path}</span>
                <a className="fe-back" href={apiUrl(`/api/file/raw?path=${encodeURIComponent(file.path)}`)} download={file.name} title="Download file">⬇ open</a>
              </div>
              {error && <div className="fe-empty">{error}</div>}
              {!error && file.isImage ? (
                <img className="fe-img" src={apiUrl(`/api/file/raw?path=${encodeURIComponent(file.path)}`)} alt={file.name} onError={() => setError('image could not be loaded')} />
              ) : !error && file.contentType === 'application/pdf' ? (
                <iframe className="fe-pdf" src={apiUrl(`/api/file/raw?path=${encodeURIComponent(file.path)}`)} title={file.name} onError={() => setError('pdf could not be loaded')} />
              ) : !error && content === null ? (
                <div className="fe-empty">Loading…</div>
              ) : !error && content.tooLarge ? (
                <div className="fe-empty">File is {Math.round(content.size / 1024)}KB — too large to preview (1MB limit).</div>
              ) : !error && content.error ? (
                <div className="fe-empty">{content.error}</div>
              ) : !error && (
                <pre className="fe-content">{content.content}</pre>
              )}
            </div>
          ) : entries === null ? (
            error ? (
              <div className="fe-empty">{error} <button className="fe-back" onClick={() => loadDir(dir)}>retry</button></div>
            ) : (
              <div className="fe-empty">Loading…</div>
            )
          ) : entries.length === 0 ? (
            <div className="fe-empty">No files</div>
          ) : (
            <ul className="fe-list">
              {dir && (
                <li><button className="fe-entry fe-entry--dir" onClick={() => setDir(dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '')}><Folder size={14} /> ..</button></li>
              )}
              {entries.map(e => (
                <li key={e.name}>
                  <button
                    className={`fe-entry ${e.dir ? 'fe-entry--dir' : 'fe-entry--file'}`}
                    onClick={() => e.dir ? setDir(dir ? `${dir}/${e.name}` : e.name) : openFile(e)}
                  >
                    {e.dir ? <Folder size={14} /> : <FileIcon size={14} />} <span>{e.name}</span>
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
