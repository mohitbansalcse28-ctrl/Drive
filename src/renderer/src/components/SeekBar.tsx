import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { formatDuration, videoUrl } from '../lib/format'
import { whenSeekable } from '../lib/media'

interface Props {
  videoId: string
  current: number
  duration: number
  buffered: number
  loopA: number | null
  loopB: number | null
  onSeek: (t: number) => void
  onScrub: (scrubbing: boolean) => void
}

/** Seek bar with buffered range, A-B loop markers and a live frame preview on hover. */
export function SeekBar({ videoId, current, duration, buffered, loopA, loopB, onSeek, onScrub }: Props) {
  const bar = useRef<HTMLDivElement>(null)
  const previewVideo = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null)
  // The preview decoder is created only while the pointer is on the bar, so it never
  // competes with the main video while it opens, buffers or seeks.
  const [armed, setArmed] = useState(false)
  const disarmTimer = useRef<number>()
  useEffect(() => setArmed(false), [videoId])
  useEffect(() => () => clearTimeout(disarmTimer.current), [])
  const [drag, setDrag] = useState<number | null>(null)
  const pendingSeek = useRef<number | null>(null)
  const seeking = useRef(false)
  const ready = useRef(false)

  const timeAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - r.left, r.width))
    return { x, t: duration ? (x / r.width) * duration : 0 }
  }

  // Throttled preview seeking: only one seek in flight, always converge on the latest target.
  const requestPreview = (t: number) => {
    const v = previewVideo.current
    if (!Number.isFinite(t)) return
    // Not loaded (or not decoding) yet: remember the latest target and apply it once ready.
    if (!v || !ready.current || seeking.current) {
      pendingSeek.current = t
      return
    }
    seeking.current = true
    v.currentTime = t
  }

  useEffect(() => {
    const v = previewVideo.current
    if (!v) return
    ready.current = false
    let alive = true
    // Seeking a never-played element can scan the whole file (see whenSeekable), so let the
    // preview decoder start, pause it, and only then serve preview seeks.
    const onMeta = () =>
      void whenSeekable(v).then(() => {
        if (!alive) return
        v.pause()
        ready.current = true
        const next = pendingSeek.current
        pendingSeek.current = null
        if (next !== null) requestPreview(next)
      })
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    const onSeeked = () => {
      const c = canvas.current
      if (c && v.videoWidth) {
        c.width = 192
        c.height = Math.round((192 * v.videoHeight) / v.videoWidth)
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      }
      seeking.current = false
      if (pendingSeek.current !== null) {
        const next = pendingSeek.current
        pendingSeek.current = null
        requestPreview(next)
      }
    }
    v.addEventListener('seeked', onSeeked)
    return () => {
      alive = false
      v.removeEventListener('loadedmetadata', onMeta)
      v.removeEventListener('seeked', onSeeked)
      seeking.current = false
      pendingSeek.current = null
    }
  }, [videoId, armed])

  const onPointerDown = (e: PointerEvent) => {
    bar.current!.setPointerCapture(e.pointerId)
    const { t } = timeAt(e.clientX)
    setDrag(t)
    onScrub(true)
  }
  const onPointerMove = (e: PointerEvent) => {
    clearTimeout(disarmTimer.current)
    if (!armed) setArmed(true)
    const h = timeAt(e.clientX)
    setHover(h)
    requestPreview(h.t)
    if (drag !== null) setDrag(h.t)
  }
  const onPointerUp = (e: PointerEvent) => {
    if (drag === null) return
    const { t } = timeAt(e.clientX)
    onSeek(t)
    setDrag(null)
    onScrub(false)
  }

  const shown = drag ?? current
  const pct = (t: number) => (duration ? `${(t / duration) * 100}%` : '0%')

  return (
    <div
      ref={bar}
      className={`seekbar ${drag !== null ? 'dragging' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        if (drag === null) setHover(null)
        disarmTimer.current = window.setTimeout(() => setArmed(false), 4000)
      }}
      data-testid="seekbar"
    >
      {armed && <video ref={previewVideo} src={videoUrl(videoId)} muted preload="metadata" crossOrigin="anonymous" hidden />}
      <div className="seek-track">
        <div className="seek-buffered" style={{ width: pct(buffered) }} />
        {loopA !== null && (
          <div
            className="seek-loop"
            style={{ left: pct(loopA), width: loopB !== null ? `calc(${pct(loopB)} - ${pct(loopA)})` : '2px' }}
          />
        )}
        {hover && <div className="seek-hover" style={{ width: `${hover.x}px` }} />}
        <div className="seek-fill" style={{ width: pct(shown) }} />
        <div className="seek-thumb" style={{ left: pct(shown) }} />
      </div>
      {hover && (
        <div className="seek-preview" style={{ left: hover.x }}>
          <canvas ref={canvas} />
          <span>{formatDuration(hover.t)}</span>
        </div>
      )}
    </div>
  )
}
