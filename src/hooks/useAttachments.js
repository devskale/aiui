// ════════════════════════════════════════════════════════════════════
// useAttachments — file upload handling (drag, paste, picker)
// ════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react'

const IMG_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useAttachments() {
  const [attachments, setAttachments] = useState([])

  const addFiles = useCallback(async (fileList) => {
    const newAtts = []
    for (const file of fileList) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
      if (IMG_TYPES.includes(file.type)) {
        try {
          const dataUrl = await fileToDataUrl(file)
          newAtts.push({ id, file, name: file.name, type: 'image', dataUrl })
        } catch {}
      } else {
        // Upload non-image files to server
        const fd = new FormData()
        fd.append('file', file)
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd })
          if (res.ok) {
            const data = await res.json()
            newAtts.push({ id, file, name: file.name, type: 'file', serverFile: data.files?.[0] })
          }
        } catch {}
      }
    }
    setAttachments(prev => [...prev, ...newAtts])
  }, [])

  const remove = useCallback((id) => {
    setAttachments(prev => prev.filter(a => a.id !== id))
  }, [])

  const clear = useCallback(() => setAttachments([]), [])

  const buildPayload = useCallback(() => {
    return attachments.map(a => {
      if (a.type === 'image') return { type: 'image', dataUrl: a.dataUrl, name: a.name }
      return { type: 'file', name: a.name, ...a.serverFile }
    })
  }, [attachments])

  return { attachments, addFiles, remove, clear, buildPayload }
}
