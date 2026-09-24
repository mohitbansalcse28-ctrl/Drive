import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  Camera,
  Captions,
  ChevronsLeft,
  ChevronsRight,
  Expand,
  ExternalLink,
  Gauge,
  Heart,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume1,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import type { SubtitleFile, Video } from '@shared/types'
import { api, useStore } from '../store'
import { formatDuration, resolutionLabel, thumbUrl, videoUrl } from '../lib/format'
import { SeekBar } from './SeekBar'

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
type Fit = 'contain' | 'cover' | 'fill'
type Panel = 'speed' | 'adjust' | 'queue' | null

interface Adjust {
  brightness: number
  contrast: number
  saturate: number
  hue: number
}
const NO_ADJUST: Adjust = { brightness: 100, contrast: 100, saturate: 100, hue: 0 }

type PlayerState = NonNullable<ReturnType<typeof useStore.getState>['player']>

/** `player` is passed as a prop so the exit animation can keep rendering after the store clears it. */
export function Player({ player }: { player: PlayerState }) {
  const lib = useStore((s) => s.lib)!
  const closePlayer = useStore((s) => s.closePlayer)
  const setPlayerIndex = useStore((s) => s.setPlayerIndex)
  const patchVideo = useStore((s) => s.patchVideo)
  const settings = lib.settings
  const video: Video | undefined = lib.videos[player.queue[player.index]]

  const root = useRef<HTMLDivElement>(null)
  const el = useRef<HTMLVideoElement>(null)
  const ambient = useRef<HTMLCanvasElement>(null)
  const audio = useRef<{ ctx: AudioContext; gain: GainNode } | null>(null)
  const hideTimer = useRef<number>()
  const osdTimer = useRef<number>()
  const lastSaved = useRef(0)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [volume, setVolume] = useState(settings.defaultVolume)
  const [muted, setMuted] = useState(false)
  const [speed, setSpeed] = useState(settings.defaultSpeed)
  const [showUi, setShowUi] = useState(true)
  const [scrubbing, setScrubbing] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [fit, setFit] = useState<Fit>('contain')
  const [adjust, setAdjust] = useState<Adjust>(NO_ADJUST)
  const [loop, setLoop] = useState<'off' | 'one' | 'all'>('off')
  const [loopA, setLoopA] = useState<number | null>(null)
  const [loopB, setLoopB] = useState<number | null>(null)
  const [subtitle, setSubtitle] = useState<(SubtitleFile & { url: string }) | null>(null)
  const [subsOn, setSubsOn] = useState(true)
  const [osd, setOsd] = useState<{ text: string; icon?: ReactNode; big?: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [upNext, setUpNext] = useState<number | null>(null)
  const [resumed, setResumed] = useState<number | null>(null)
  const [stats, setStats] = useState(false)

  const hasNext = player.index < player.queue.length - 1 || loop === 'all'
  const hasPrev = player.index > 0

  const flash = useCallback((text: string, icon?: ReactNode, big = false) => {
    setOsd({ text, icon, big })
    clearTimeout(osdTimer.current)
    osdTimer.current = window.setTimeout(() => setOsd(null), big ? 650 : 1100)
  }, [])

  const poke = useCallback(() => {
    setShowUi(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = window.setTimeout(() => setShowUi(false), 2600)
  }, [])

  const saveProgress = useCallback(() => {
    const v = el.current
    if (!v || !video || !Number.isFinite(v.duration)) return
    const d = v.duration
    const t = v.currentTime
    void api.saveProgress(video.id, t, d)
    patchVideo(video.id, t / d >= 0.92 ? { position: 0, watched: true, duration: d } : { position: t, duration: d })
  }, [video, patchVideo])

  // ---- load a new video
  useEffect(() => {
    if (!video) return
    setError(null)
    setUpNext(null)
    setLoopA(null)
    setLoopB(null)
    setCurrent(0)
    setDuration(video.duration ?? 0)
    setBuffered(0)
    setSubtitle(null)
    setResumed(null)
    void api.markPlayed(video.id)
    let cancelled = false
    void api.findSubtitle(video.id).then((s) => {
      if (!cancelled && s) setSubtitle({ ...s, url: URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' })) })
    })
    poke()
    return () => {
      cancelled = true
      saveProgress()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.id])

  useEffect(
    () => () => {
      if (subtitle) URL.revokeObjectURL(subtitle.url)
    },
    [subtitle]
  )

  // ---- apply element state
  useEffect(() => {
    const v = el.current
    if (!v) return
    const boosted = volume > 1
    if (boosted && !audio.current) {
      const ctx = new AudioContext()
      const gain = ctx.createGain()
      ctx.createMediaElementSource(v).connect(gain).connect(ctx.destination)
      audio.current = { ctx, gain }
    }
    v.volume = Math.min(1, volume)
    if (audio.current) audio.current.gain.gain.value = boosted ? volume : 1
    v.muted = muted
  }, [volume, muted])

  useEffect(() => {
    if (el.current) el.current.playbackRate = speed
  }, [speed, video?.id])

  // Cues are rendered by us (not the native overlay) so they can float above the controls.
  const [cueText, setCueText] = useState<string[]>([])
  useEffect(() => {
    setCueText([])
    const track = el.current?.textTracks[0]
    if (!track) return
    track.mode = 'hidden'
    const onCue = () => {
      const cues = [...(track.activeCues ?? [])] as VTTCue[]
      setCueText(cues.map((c) => c.text.replace(/<[^>]+>/g, '')))
    }
    track.addEventListener('cuechange', onCue)
    return () => track.removeEventListener('cuechange', onCue)
  }, [subtitle])

  useEffect(() => () => void audio.current?.ctx.close(), [])

  // ---- ambient light: sample the frame into a tiny canvas that is blurred behind the video
  useEffect(() => {
    if (!settings.ambientMode) return
    let raf = 0
    let last = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      if (now - last < 120) return
      last = now
      const v = el.current
      const c = ambient.current
      if (!v || !c || v.readyState < 2) return
      try {
        c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height)
      } catch {
        /* frame not ready */
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [settings.ambientMode, video?.id])

  // ---- fullscreen tracking
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ---- periodic progress save
  useEffect(() => {
    const t = window.setInterval(() => playing && saveProgress(), 5000)
    return () => clearInterval(t)
  }, [playing, saveProgress])

  // ---- up-next countdown
  useEffect(() => {
    if (upNext === null) return
    if (upNext <= 0) {
      goNext()
      return
    }
    const t = window.setTimeout(() => setUpNext((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upNext])

  const togglePlay = useCallback(() => {
    const v = el.current
    if (!v) return
    if (v.paused) {
      void v.play()
      flash('', <Play size={34} fill="currentColor" />, true)
    } else {
      v.pause()
      flash('', <Pause size={34} fill="currentColor" />, true)
    }
    setUpNext(null)
  }, [flash])

  const seekTo = useCallback((t: number) => {
    const v = el.current
    if (!v || !Number.isFinite(v.duration)) return
    v.currentTime = Math.max(0, Math.min(t, v.duration - 0.05))
    setCurrent(v.currentTime)
  }, [])

  const seekBy = useCallback(
    (d: number) => {
      const v = el.current
      if (!v) return
      seekTo(v.currentTime + d)
      flash(`${d > 0 ? '+' : ''}${d}s`, d > 0 ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />)
    },
    [seekTo, flash]
  )

  const changeVolume = useCallback(
    (next: number) => {
      const vol = Math.max(0, Math.min(2, Math.round(next * 100) / 100))
      setVolume(vol)
      setMuted(false)
      flash(`Volume ${Math.round(vol * 100)}%${vol > 1 ? ' · boost' : ''}`, <Volume2 size={18} />)
    },
    [flash]
  )

  const changeSpeed = useCallback(
    (next: number) => {
      const s = Math.max(0.25, Math.min(3, Math.round(next * 100) / 100))
      setSpeed(s)
      flash(`Speed ${s}×`, <Gauge size={18} />)
    },
    [flash]
  )

  function goNext() {
    setUpNext(null)
    if (player.index < player.queue.length - 1) setPlayerIndex(player.index + 1)
    else if (loop === 'all') setPlayerIndex(0)
  }
  function goPrev() {
    const v = el.current
    if (v && v.currentTime > 5) return seekTo(0)
    if (hasPrev) setPlayerIndex(player.index - 1)
  }

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.current?.requestFullscreen()
  }, [])

  const close = useCallback(() => {
    saveProgress()
    if (document.fullscreenElement) void document.exitFullscreen()
    closePlayer()
  }, [saveProgress, closePlayer])

  const snapshot = useCallback(async () => {
    const v = el.current
    if (!v || !video || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    ctx.filter = cssFilter(adjust)
    ctx.drawImage(v, 0, 0)
    try {
      const file = await api.saveSnapshot(c.toDataURL('image/png'), `${video.name} ${formatDuration(v.currentTime).replace(/:/g, '-')}`)
      if (file) useStore.getState().toast('Snapshot saved to Pictures › Lumina', 'success')
      flash('Snapshot saved', <Camera size={18} />)
    } catch (err) {
      useStore.getState().toast(`Snapshot failed: ${(err as Error).message}`, 'error')
    }
  }, [video, adjust, flash])

  const cycleLoopAB = useCallback(() => {
    const t = el.current?.currentTime ?? 0
    if (loopA === null) {
      setLoopA(t)
      flash('Loop start set — press B again for end', <Repeat size={18} />)
    } else if (loopB === null && t > loopA) {
      setLoopB(t)
      flash(`A-B loop ${formatDuration(loopA)} → ${formatDuration(t)}`, <Repeat size={18} />)
    } else {
      setLoopA(null)
      setLoopB(null)
      flash('A-B loop off', <Repeat size={18} />)
    }
  }, [loopA, loopB, flash])

  const loadSubs = useCallback(async () => {
    const s = await api.pickSubtitle()
    if (s) {
      setSubtitle({ ...s, url: URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' })) })
      setSubsOn(true)
      flash(`Subtitles: ${s.name}`, <Captions size={18} />)
    }
  }, [flash])

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      const v = el.current
      poke()
      const k = e.key
      const handled = true
      switch (true) {
        case k === ' ' || k === 'k':
          togglePlay()
          break
        case k === 'ArrowRight':
          seekBy(e.shiftKey ? 30 : e.ctrlKey ? 60 : 5)
          break
        case k === 'ArrowLeft':
          seekBy(e.shiftKey ? -30 : e.ctrlKey ? -60 : -5)
          break
        case k === 'l':
          seekBy(settings.seekStep)
          break
        case k === 'j':
          seekBy(-settings.seekStep)
          break
        case k === 'ArrowUp':
          changeVolume(volume + 0.05)
          break
        case k === 'ArrowDown':
          changeVolume(volume - 0.05)
          break
        case k === 'm':
          setMuted((m) => {
            flash(m ? 'Unmuted' : 'Muted', m ? <Volume2 size={18} /> : <VolumeX size={18} />)
            return !m
          })
          break
        case k === 'f':
          toggleFullscreen()
          break
        case k === 'Escape':
          if (panel) setPanel(null)
          else if (!document.fullscreenElement) close()
          break
        case k === 'N' || (k === 'n' && !e.shiftKey) || k === 'PageDown':
          goNext()
          break
        case k === 'P' || k === 'p' || k === 'PageUp':
          goPrev()
          break
        case k === ']' || k === '>':
          changeSpeed(speed + 0.25)
          break
        case k === '[' || k === '<':
          changeSpeed(speed - 0.25)
          break
        case k === '=':
          changeSpeed(1)
          break
        case k === 'c':
          if (subtitle) {
            setSubsOn((s) => !s)
            flash(subsOn ? 'Subtitles off' : 'Subtitles on', <Captions size={18} />)
          } else void loadSubs()
          break
        case k === 's':
          void snapshot()
          break
        case k === 'b':
          cycleLoopAB()
          break
        case k === 'i':
          setStats((x) => !x)
          break
        case k === 'a':
          setFit((f) => {
            const n: Fit = f === 'contain' ? 'cover' : f === 'cover' ? 'fill' : 'contain'
            flash(`Aspect: ${n === 'contain' ? 'Fit' : n === 'cover' ? 'Crop to fill' : 'Stretch'}`, <Expand size={18} />)
            return n
          })
          break
        case k === ',' && !!v?.paused:
          if (v) v.currentTime = Math.max(0, v.currentTime - 1 / 30)
          break
        case k === '.' && !!v?.paused:
          if (v) v.currentTime = v.currentTime + 1 / 30
          break
        case /^[0-9]$/.test(k) && !e.ctrlKey:
          if (v && Number.isFinite(v.duration)) seekTo((Number(k) / 10) * v.duration)
          break
        default:
          return
      }
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!video) return null
  const res = resolutionLabel(video.height)
  const VolIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2
  const nextVideo = lib.videos[player.queue[(player.index + 1) % player.queue.length]]

  return (
    <motion.div
      ref={root}
      className={`player ${showUi || !playing || panel ? 'ui' : 'idle'}`}
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.25 }}
      onMouseMove={poke}
      data-testid="player"
    >
      {settings.ambientMode && <canvas ref={ambient} className="ambient" width={32} height={18} />}
      <video
        ref={el}
        className="player-video"
        src={videoUrl(video.id)}
        crossOrigin="anonymous"
        autoPlay
        style={{ objectFit: fit, filter: cssFilter(adjust) }}
        onClick={() => (panel ? setPanel(null) : togglePlay())}
        onDoubleClick={toggleFullscreen}
        onWheel={(e) => changeVolume(volume + (e.deltaY < 0 ? 0.05 : -0.05))}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false)
          saveProgress()
        }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget
          setDuration(v.duration)
          v.playbackRate = speed
          if (settings.resumePlayback && video.position > 5 && video.position < v.duration - 10) {
            v.currentTime = video.position
            setResumed(video.position)
            window.setTimeout(() => setResumed(null), 6000)
          }
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget
          if (!scrubbing) setCurrent(v.currentTime)
          if (loopA !== null && loopB !== null && v.currentTime >= loopB) v.currentTime = loopA
          if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1))
          if (Date.now() - lastSaved.current > 15000) {
            lastSaved.current = Date.now()
            saveProgress()
          }
        }}
        onEnded={() => {
          saveProgress()
          if (loop === 'one') {
            seekTo(0)
            void el.current?.play()
          } else if (settings.autoplayNext && hasNext) setUpNext(5)
        }}
        onError={() => setError('This video format or codec is not supported by the built-in player.')}
      >
        {subtitle && <track key={subtitle.url} kind="subtitles" src={subtitle.url} label={subtitle.name} />}
      </video>

      {subsOn && cueText.length > 0 && (
        <div className="subtitles">
          {cueText.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      )}

      {/* top bar */}
      <div className="player-top">
        <button className="p-btn" onClick={close} title="Back to library (Esc)" data-testid="player-close">
          <ArrowLeft size={20} />
        </button>
        <div className="player-title">
          <h2>{video.name}</h2>
          <span>
            {player.sourceLabel} · {player.index + 1} / {player.queue.length}
            {res && <b className="badge">{res}</b>}
          </span>
        </div>
        <div className="toolbar-spacer" />
        <button
          className={`p-btn ${video.favorite ? 'fav' : ''}`}
          onClick={() => void api.updateVideo(video.id, { favorite: !video.favorite })}
          title="Favorite"
        >
          <Heart size={19} fill={video.favorite ? 'currentColor' : 'none'} />
        </button>
        <button className={`p-btn ${panel === 'queue' ? 'on' : ''}`} onClick={() => setPanel(panel === 'queue' ? null : 'queue')} title="Up next">
          <ListVideo size={19} />
        </button>
      </div>

      {/* centre feedback */}
      <AnimatePresence>
        {osd && (
          <motion.div
            key={osd.text + String(osd.big)}
            className={`osd ${osd.big ? 'big' : ''}`}
            initial={{ opacity: 0, scale: osd.big ? 0.6 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: osd.big ? 1.4 : 0.95 }}
            transition={{ duration: 0.18 }}
          >
            {osd.icon}
            {osd.text && <span>{osd.text}</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {resumed !== null && (
        <motion.div className="resume-toast" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          Resumed from {formatDuration(resumed)}
          <button
            onClick={() => {
              seekTo(0)
              setResumed(null)
            }}
          >
            Start over
          </button>
        </motion.div>
      )}

      {error && (
        <div className="player-error">
          <h3>Can’t play this one</h3>
          <p>{error}</p>
          <div className="empty-actions">
            <button className="btn primary" onClick={() => api.openExternal(video.id)}>
              <ExternalLink size={16} /> Open in default app
            </button>
            {hasNext && (
              <button className="btn glass" onClick={goNext}>
                <SkipForward size={16} /> Next video
              </button>
            )}
          </div>
        </div>
      )}

      {upNext !== null && nextVideo && (
        <motion.div className="up-next" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="up-next-thumb">
            {nextVideo.thumbAt && <img src={thumbUrl(nextVideo.id, nextVideo.thumbAt)} alt="" />}
            <svg viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" className="ring-bg" />
              <circle cx="18" cy="18" r="16" className="ring" style={{ strokeDashoffset: `${(upNext / 5) * 100.5}` }} />
            </svg>
            <span>{upNext}</span>
          </div>
          <div>
            <small>Up next</small>
            <strong>{nextVideo.name}</strong>
            <div className="empty-actions">
              <button className="btn primary sm" onClick={goNext}>
                Play now
              </button>
              <button className="btn glass sm" onClick={() => setUpNext(null)}>
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {stats && (
        <div className="stats-overlay">
          <b>Stats for nerds</b>
          <span>File</span>
          <code>{video.path}</code>
          <span>Resolution</span>
          <code>
            {el.current?.videoWidth}×{el.current?.videoHeight}
          </code>
          <span>Format</span>
          <code>{video.ext.toUpperCase()}</code>
          <span>Dropped frames</span>
          <code>
            {el.current?.getVideoPlaybackQuality().droppedVideoFrames ?? 0} / {el.current?.getVideoPlaybackQuality().totalVideoFrames ?? 0}
          </code>
          <span>Buffered</span>
          <code>{formatDuration(buffered)}</code>
        </div>
      )}

      {/* side panels */}
      <AnimatePresence>
        {panel === 'queue' && (
          <motion.aside className="queue" initial={{ x: 380 }} animate={{ x: 0 }} exit={{ x: 380 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}>
            <div className="queue-head">
              <h3>Up next</h3>
              <span>{player.queue.length} videos</span>
              <button className="p-btn sm" onClick={() => setPanel(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="queue-list">
              {player.queue.map((id, i) => {
                const q = lib.videos[id]
                if (!q) return null
                return (
                  <button key={id} className={`queue-item ${i === player.index ? 'now' : ''}`} onClick={() => setPlayerIndex(i)}>
                    <span className="queue-idx">{i === player.index ? <Play size={12} fill="currentColor" /> : i + 1}</span>
                    <div className="queue-thumb">{q.thumbAt && <img src={thumbUrl(q.id, q.thumbAt)} alt="" />}</div>
                    <div className="queue-text">
                      <strong>{q.name}</strong>
                      <small>{formatDuration(q.duration)}</small>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.aside>
        )}
        {panel === 'speed' && (
          <motion.div className="pop speed-pop" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <h4>Playback speed</h4>
            <div className="speed-grid">
              {SPEEDS.map((s) => (
                <button key={s} className={speed === s ? 'on' : ''} onClick={() => changeSpeed(s)}>
                  {s}×
                </button>
              ))}
            </div>
            <input type="range" min={0.25} max={3} step={0.05} value={speed} onChange={(e) => changeSpeed(Number(e.target.value))} />
          </motion.div>
        )}
        {panel === 'adjust' && (
          <motion.div className="pop adjust-pop" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
            <h4>Picture</h4>
            {(
              [
                ['brightness', 'Brightness', 30, 200],
                ['contrast', 'Contrast', 30, 200],
                ['saturate', 'Saturation', 0, 250],
                ['hue', 'Hue', -180, 180]
              ] as const
            ).map(([key, label, min, max]) => (
              <label key={key} className="slider-row">
                <span>{label}</span>
                <input type="range" min={min} max={max} value={adjust[key]} onChange={(e) => setAdjust({ ...adjust, [key]: Number(e.target.value) })} />
                <code>{adjust[key]}</code>
              </label>
            ))}
            <div className="fit-row">
              {(['contain', 'cover', 'fill'] as Fit[]).map((f) => (
                <button key={f} className={fit === f ? 'on' : ''} onClick={() => setFit(f)}>
                  {f === 'contain' ? 'Fit' : f === 'cover' ? 'Crop' : 'Stretch'}
                </button>
              ))}
            </div>
            <button className="btn glass sm block" onClick={() => setAdjust(NO_ADJUST)}>
              Reset
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* bottom controls */}
      <div className="player-bottom" onClick={(e) => e.stopPropagation()}>
        <SeekBar
          videoId={video.id}
          current={current}
          duration={duration}
          buffered={buffered}
          loopA={loopA}
          loopB={loopB}
          onSeek={seekTo}
          onScrub={setScrubbing}
        />
        <div className="controls">
          <button className="p-btn" onClick={goPrev} disabled={!hasPrev && current < 5} title="Previous (P)">
            <SkipBack size={19} fill="currentColor" />
          </button>
          <button className="p-btn play" onClick={togglePlay} title="Play/Pause (Space)" data-testid="play-toggle">
            {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <button className="p-btn" onClick={goNext} disabled={!hasNext} title="Next (N)">
            <SkipForward size={19} fill="currentColor" />
          </button>
          <button className="p-btn" onClick={() => seekBy(-settings.seekStep)} title={`Back ${settings.seekStep}s (J)`}>
            <ChevronsLeft size={20} />
          </button>
          <button className="p-btn" onClick={() => seekBy(settings.seekStep)} title={`Forward ${settings.seekStep}s (L)`}>
            <ChevronsRight size={20} />
          </button>
          <div className="volume">
            <button className="p-btn" onClick={() => setMuted((m) => !m)} title="Mute (M)">
              <VolIcon size={20} />
            </button>
            <input
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              style={{ '--v': `${((muted ? 0 : volume) / 2) * 100}%` } as React.CSSProperties}
              title="Volume — up to 200% boost"
            />
          </div>
          <span className="time" data-testid="time">
            {formatDuration(current)} <i>/</i> {formatDuration(duration)}
          </span>
          <div className="toolbar-spacer" />
          <button className={`p-btn text ${panel === 'speed' ? 'on' : ''}`} onClick={() => setPanel(panel === 'speed' ? null : 'speed')} title="Speed ([ / ])">
            {speed}×
          </button>
          <button
            className={`p-btn ${subtitle && subsOn ? 'on' : ''}`}
            onClick={() => (subtitle ? setSubsOn((s) => !s) : void loadSubs())}
            onContextMenu={(e) => {
              e.preventDefault()
              void loadSubs()
            }}
            title={subtitle ? `Subtitles: ${subtitle.name} (C) · right-click to load another` : 'Load subtitles (C)'}
          >
            <Captions size={20} />
          </button>
          <button className={`p-btn ${loopA !== null ? 'on' : ''}`} onClick={cycleLoopAB} title="A-B loop (B)">
            <span className="ab">A·B</span>
          </button>
          <button
            className={`p-btn ${loop !== 'off' ? 'on' : ''}`}
            onClick={() => {
              const n = loop === 'off' ? 'all' : loop === 'all' ? 'one' : 'off'
              setLoop(n)
              flash(n === 'off' ? 'Repeat off' : n === 'all' ? 'Repeat queue' : 'Repeat this video', <Repeat size={18} />)
            }}
            title="Repeat"
          >
            {loop === 'one' ? <Repeat1 size={19} /> : <Repeat size={19} />}
          </button>
          <button className="p-btn" onClick={() => void snapshot()} title="Snapshot (S)">
            <Camera size={19} />
          </button>
          <button className={`p-btn ${panel === 'adjust' ? 'on' : ''}`} onClick={() => setPanel(panel === 'adjust' ? null : 'adjust')} title="Picture settings">
            <SlidersHorizontal size={19} />
          </button>
          <button
            className="p-btn"
            onClick={() => (document.pictureInPictureElement ? void document.exitPictureInPicture() : void el.current?.requestPictureInPicture())}
            title="Picture in picture"
          >
            <PictureInPicture2 size={19} />
          </button>
          <button className="p-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
            {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

function cssFilter(a: Adjust): string {
  if (a === NO_ADJUST) return 'none'
  return `brightness(${a.brightness}%) contrast(${a.contrast}%) saturate(${a.saturate}%) hue-rotate(${a.hue}deg)`
}
