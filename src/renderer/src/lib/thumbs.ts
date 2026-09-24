import { useEffect, useRef } from 'react'
import { api, useStore } from '../store'
import { videoUrl } from './format'

const THUMB_WIDTH = 640
const TIMEOUT_MS = 15000

/** Load a video off-screen, seek to a representative frame and capture it as a JPEG. */
export function captureFrame(
  id: string,
  at: number
): Promise<{ dataUrl?: string; duration?: number; width?: number; height?: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    let settled = false
    const done = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
      video.removeAttribute('src')
      video.load()
    }
    const timer = setTimeout(() => done(() => reject(new Error('timeout'))), TIMEOUT_MS)

    video.addEventListener('error', () => done(() => reject(new Error('unsupported'))))
    video.addEventListener('loadedmetadata', () => {
      const d = video.duration
      const target = Number.isFinite(d) && d > 0 ? Math.min(d * at, Math.max(d - 0.5, 0)) : 1
      video.currentTime = target
    })
    video.addEventListener('seeked', () =>
      done(() => {
        const { videoWidth: w, videoHeight: h, duration } = video
        if (!w || !h) return resolve({ duration, width: w, height: h })
        const canvas = document.createElement('canvas')
        canvas.width = THUMB_WIDTH
        canvas.height = Math.round((THUMB_WIDTH * h) / w)
        canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
        resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.82), duration, width: w, height: h })
      })
    )
    video.src = videoUrl(id)
  })
}

/** Background worker: generates missing thumbnails one at a time without blocking the UI. */
export function useThumbnailEngine(): void {
  const lib = useStore((s) => s.lib)
  const busy = useRef(false)
  const attempted = useRef(new Set<string>())

  useEffect(() => {
    if (!lib || busy.current) return
    const next = Object.values(lib.videos).find(
      (v) => !v.thumbAt && !v.thumbFailed && !v.missing && !attempted.current.has(v.id)
    )
    if (!next) return
    busy.current = true
    attempted.current.add(next.id)
    captureFrame(next.id, lib.settings.thumbnailAt)
      .then((r) => api.saveThumb({ videoId: next.id, ...r, failed: !r.dataUrl }))
      .catch(() => api.saveThumb({ videoId: next.id, failed: true }))
      .finally(() => {
        busy.current = false
        // Nudge the effect even if the library broadcast was coalesced.
        useStore.setState((s) => ({ lib: s.lib ? { ...s.lib } : s.lib }))
      })
  }, [lib])

  // A library reset (thumbs cleared) should allow retrying everything.
  useEffect(() => {
    if (lib && Object.values(lib.videos).every((v) => !v.thumbAt && !v.thumbFailed)) attempted.current.clear()
  }, [lib])
}
