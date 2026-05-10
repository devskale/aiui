import { Icons } from '../lib/icons'

// ─── File row inside an expanded folder ────────────────────
export function FileRow({ file, folders, onInsert, onMove, onDelete }) {
  return (
    <div className="folder-file-item">
      <span className="ff-icon">
        {file.mime_type?.startsWith('image/') ? '🖼' : file.mime_type === 'application/pdf' ? '📄' : '📝'}
      </span>
      <span className="ff-name" title={file.original_name}>{file.original_name}</span>
      <span className="ff-file-actions">
        <button className="ff-add" title="Add to chat" onClick={onInsert}>+</button>
        <select className="ff-move-mini" defaultValue={file.folder_id || ''} onChange={e => onMove(e.target.value || null)} title="Move">
          <option value="">—</option>
          {(folders || []).filter(f => f.id !== null && f.id !== file.folder_id)
            .map(f => <option key={f.id} value={f.id}>{f.icon}</option>)}
        </select>
        <button className="ff-del" onClick={onDelete}>✕</button>
      </span>
    </div>
  )
}

// ─── Expanded folder with file list ────────────────────────
// Calls onRefresh() after upload/move/delete to refresh both files and folder counts.
export function FolderExpansion({ folderId, files, folders, onRefresh, onInsertFile }) {
  const uploadFiles = async (e) => {
    const fileList = e.target.files
    if (!fileList.length) return
    const url = folderId ? `/api/upload?folder_id=${folderId}` : '/api/upload'
    for (const file of Array.from(fileList)) {
      const fd = new FormData(); fd.append('file', file)
      await fetch(url, { method: 'POST', body: fd })
    }
    e.target.value = ''
    onRefresh()
  }

  const deleteFile = async (fileId) => {
    if (!confirm('Delete this file?')) return
    try { await fetch(`/api/files/${fileId}`, { method: 'DELETE' }); onRefresh() }
    catch { /* ignore */ }
  }

  const moveFile = async (fileId, newFolderId) => {
    try {
      await fetch(`/api/files/${fileId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder_id: newFolderId }),
      })
      onRefresh()
    } catch { /* ignore */ }
  }

  return (
    <div className="folder-files-list">
      <label className="folder-upload-bar">
        <span>📤 Upload...</span>
        <input type="file" multiple accept="image/*,.pdf,.txt,.md" onChange={uploadFiles} />
      </label>
      {files.length === 0 ? (
        <span className="folder-empty">Empty</span>
      ) : files.map(file => (
        <FileRow key={file.id} file={file} folders={folders}
          onInsert={() => onInsertFile?.current?.(file.original_name)}
          onMove={id => moveFile(file.id, id)}
          onDelete={() => deleteFile(file.id)} />
      ))}
    </div>
  )
}
