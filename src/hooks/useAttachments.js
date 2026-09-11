// ════════════════════════════════════════════════════════════════════
// useAttachments — file upload handling (drag, paste, picker)
// All files upload to server. Server returns path + dataUrl for images.
// ════════════════════════════════════════════════════════════════════
import { useState, useCallback } from 'react'
import { apiUrl } from '../lib/api'

// Downscale big images BEFORE upload: vision models cap around ~1568px on
// the long edge, so anything larger only costs upload time — and a 10-page
// scan set at full photo size would blow the prompt body limit. Keeps the
// original when already small, when it's a GIF, or when conversion fails.
const MAX_EDGE = 1600
const MAX_KEEP_BYTES = 1.5 * 1024 * 1024

async function downscaleImage(file) {
  if (!file.type || !file.type.startsWith('image/') || file.type === 'image/gif') return file
  try {
    const bitmap = await createImageBitmap(file)
    try {
      const long = Math.max(bitmap.width, bitmap.height)
      if (long <= MAX_EDGE && file.size <= MAX_KEEP_BYTES) return file
      const scale = Math.min(1, MAX_EDGE / long)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85))
      if (!blob || blob.size >= file.size) return file
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
    } finally {
      bitmap.close?.()
    }
  } catch {
    return file
  }
}

export function useAttachments() {
  const [attachments, setAttachments] = useState([])

  const addFiles = useCallback(async (fileList) => {
    const newAtts = []
    for (const original of fileList) {
      const file = await downscaleImage(original)
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
              name: original.name,
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
