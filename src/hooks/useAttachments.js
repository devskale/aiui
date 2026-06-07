// ════════════════════════════════════════════════════════════════════
// useAttachments — file upload handling (drag, paste, picker)
// All files upload to server. Server returns path + dataUrl for images.
// ════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react'
import { apiUrl } from '../lib/api'

const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export function useAttachments() {
  const [attachments, setAttachments] = useState([])

  const addFiles = useCallback(async (fileList) => {
    const newAtts = []
    for (const file of fileList) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
      const fd = new FormData()
      fd.append('files', file)
      try {
        const res = await fetch(apiUrl('/api/upload'), { method: 'POST', body: fd })
        if (res.ok) {
          const data = await res.json()
          const serverFile = data.files?.[0]
          if (serverFile) {
            newAtts.push({
              id,
              name: file.name,
              isImage: serverFile.isImage,
              previewUrl: serverFile.isImage ? serverFile.path : null,
              serverFile,
            })
          }
        }
      } catch {}
    }
    setAttachments(prev => [...prev, ...newAtts])
  }, [])

  const remove = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  const buildPayload = useCallback(() => {
    return attachments.map(a => a.serverFile).filter(Boolean)
  }, [attachments])

  return { attachments, addFiles, remove, clear, buildPayload }
}
