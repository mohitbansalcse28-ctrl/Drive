import { useEffect, useRef } from 'react'
import { api, useStore } from '../store'
import { videoUrl } from './format'
import { whenSeekable } from './media'

const THUMB_WIDTH = 560
const TIMEOUT_MS = 15000

/** Load a video off-screen, seek to a representative frame and capture it as a JPEG. */
export function captureFrame(
  id: string,
  at: number,
  signal?: AbortSignal
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
    signal?.addEventListener('abort', () => done(() => reject(new Error('aborted'))))

    video.addEventListener('error', () => done(() => reject(new Error('unsupported'))))
    video.addEventListener('loadedmetadata', async () => {
      const d = video.duration
      const target = Number.isFinite(d) && d > 0 ? Math.min(d * at, Math.max(d - 0.5, 0)) : 1
      // Seek only once decoding has started, so large MKVs jump via their index instead of scanning.
      await whenSeekable(video)
      if (settled) return
      video.pause()
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

const CONCURRENCY = 2
const SCROLL_QUIET_MS = 450

// Thumbnail decoding yields to the user: new work waits until scrolling has settled.
let lastScroll = 0
window.addEventListener('scroll', () => (lastScroll = performance.now()), { capture: true, passive: true })
window.addEventListener('wheel', () => (lastScroll = performance.now()), { capture: true, passive: true })

/**
 * Background worker pool: generates missing thumbnails a couple at a time. It pauses while
 * the player is open so playback never competes with decoding.
 */
export function useThumbnailEngine(): void {
  const lib = useStore((s) => s.lib)
  const playing = useStore((s) => !!s.player)
  const pool = useRef({ active: 0, waiting: false, attempted: new Set<string>(), inflight: new Set<AbortController>() })

  // Opening a video should get the disk and decoder to itself: cancel in-flight captures.
  useEffect(() => {
    if (!playing) return
    const st = pool.current
    for (const c of st.inflight) c.abort()
  }, [playing])

  useEffect(() => {
    if (!lib || playing) return
    const st = pool.current
    // After "Rebuild thumbnails" everything is cleared: allow retrying all videos.
    if (st.active === 0 && Object.values(lib.videos).every((v) => !v.thumbAt && !v.thumbFailed)) st.attempted.clear()

    const pump = () => {
      const cur = useStore.getState()
      if (!cur.lib || cur.player) return
      const sinceScroll = performance.now() - lastScroll
      if (sinceScroll < SCROLL_QUIET_MS) {
        if (!st.waiting) {
          st.waiting = true
          setTimeout(() => {
            st.waiting = false
            pump()
          }, SCROLL_QUIET_MS - sinceScroll)
        }
        return
      }
      while (st.active < CONCURRENCY) {
        const next = Object.values(cur.lib.videos).find(
          (v) => !v.thumbAt && !v.thumbFailed && !v.missing && !st.attempted.has(v.id)
        )
        if (!next) return
        st.attempted.add(next.id)
        st.active++
        const ctrl = new AbortController()
        st.inflight.add(ctrl)
        captureFrame(next.id, cur.lib.settings.thumbnailAt, ctrl.signal)
          .then((r) => api.saveThumb({ videoId: next.id, ...r, failed: !r.dataUrl }))
          .catch(() => {
            // Cancelled for playback: allow a retry later instead of marking it failed.
            if (ctrl.signal.aborted) st.attempted.delete(next.id)
            else return api.saveThumb({ videoId: next.id, failed: true })
          })
          .finally(() => {
            st.inflight.delete(ctrl)
            st.active--
            pump()
          })
      }
    }
    pump()
  }, [lib, playing])
}
