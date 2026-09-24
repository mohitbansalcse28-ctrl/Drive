import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
import { AlertTriangle, Check, Heart, MoreHorizontal, Pin, Play } from 'lucide-react'
import type { Collection, Video } from '@shared/types'
import { api, collectionStats, previewVideos, useStore } from '../store'
import { collectionMenu, playVideos } from '../lib/actions'
import {
  COLLECTION_GRADIENTS,
  formatBytes,
  formatDuration,
  formatLongDuration,
  resolutionLabel,
  thumbUrl,
  timeAgo,
  videoUrl
} from '../lib/format'

/** Thumbnail image with a generated gradient placeholder while it is being created. */
export function Thumb({ video, className = '' }: { video: Video; className?: string }) {
  const src = thumbUrl(video.id, video.thumbAt)
  const hue = parseInt(video.id.slice(0, 4), 16) % 360
  return (
    <div
      className={`thumb ${className}`}
      style={{
        background: `radial-gradient(120% 90% at 20% 10%, hsl(${hue} 70% 32%), hsl(${(hue + 60) % 360} 60% 12%))`
      }}
    >
      {src ? (
        <img src={src} alt="" draggable={false} loading="lazy" decoding="async" />
      ) : (
        <div className="thumb-placeholder">
          {video.missing ? <AlertTriangle size={22} /> : video.thumbFailed ? <Play size={22} /> : <span className="shimmer" />}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- folder card

export const FolderCard = memo(function FolderCard({ collection, index }: { collection: Collection; index: number }) {
  const lib = useStore((s) => s.lib)!
  const navigate = useStore((s) => s.navigate)
  const openMenu = useStore((s) => s.openMenu)
  const reduceMotion = lib.settings.reduceMotion
  const ref = useRef<HTMLDivElement>(null)
  const [a, b, c] = COLLECTION_GRADIENTS[collection.color]
  const stats = collectionStats(lib, collection)
  const previews = previewVideos(lib, collection, 3)
  const progress = stats.count ? stats.watched / stats.count : 0

  // Tilt follows the pointer, batched to one style write per animation frame.
  const frame = useRef(0)
  const rect = useRef<DOMRect | null>(null)
  const onMove = (e: MouseEvent) => {
    const el = ref.current
    if (reduceMotion || !el) return
    const { clientX, clientY } = e
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const r = (rect.current ??= el.getBoundingClientRect())
      const x = (clientX - r.left) / r.width - 0.5
      const y = (clientY - r.top) / r.height - 0.5
      el.style.setProperty('--rx', `${(-y * 9).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${(x * 11).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${((x + 0.5) * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${((y + 0.5) * 100).toFixed(1)}%`)
    })
  }
  const onLeave = () => {
    cancelAnimationFrame(frame.current)
    frame.current = 0
    rect.current = null
    ref.current?.style.setProperty('--rx', '0deg')
    ref.current?.style.setProperty('--ry', '0deg')
  }

  return (
    <div
      className="folder-wrap"
      style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}
      data-testid="folder-card"
    >
      <div
        ref={ref}
        className="folder"
        style={{ '--fa': a, '--fb': b, '--fc': c } as CSSProperties}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        onClick={() => navigate({ name: 'collection', id: collection.id })}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu(e.clientX, e.clientY, collectionMenu(collection))
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && navigate({ name: 'collection', id: collection.id })}
      >
        <div className="folder-glow" />
        <div className="folder-back" />
        <div className="folder-papers">
          {previews.length ? (
            previews.map((v, i) => (
              <div key={v.id} className={`paper paper-${i}`}>
                <img src={thumbUrl(v.id, v.thumbAt)} alt="" draggable={false} decoding="async" />
              </div>
            ))
          ) : (
            <>
              <div className="paper paper-0 blank" />
              <div className="paper paper-1 blank" />
            </>
          )}
        </div>
        <div className="folder-front">
          <div className="folder-shine" />
          <div className="folder-top">
            <span className="folder-emoji">{collection.emoji}</span>
            {collection.pinned && (
              <span className="folder-pin" title="Pinned">
                <Pin size={12} />
              </span>
            )}
            <button
              className="folder-play"
              title="Play all"
              onClick={(e) => {
                e.stopPropagation()
                playVideos(stats.vids, undefined, collection.name)
              }}
            >
              <Play size={16} fill="currentColor" />
            </button>
          </div>
          <div className="folder-info">
            <h3 title={collection.name}>{collection.name}</h3>
            <p>
              {stats.count} video{stats.count === 1 ? '' : 's'}
              {stats.duration > 0 && <> · {formatLongDuration(stats.duration)}</>}
              {stats.size > 0 && <> · {formatBytes(stats.size)}</>}
            </p>
            <div className="folder-progress" title={`${stats.watched}/${stats.count} watched`}>
              <span style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
          <button
            className="folder-more"
            onClick={(e) => {
              e.stopPropagation()
              openMenu(e.clientX, e.clientY, collectionMenu(collection))
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------- video card

function useRename(video: Video) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = () => setEditing(true)
    el.addEventListener('lumina:rename', start)
    return () => el.removeEventListener('lumina:rename', start)
  }, [])
  const commit = (value: string) => {
    setEditing(false)
    const name = value.trim()
    if (name && name !== video.name) void api.updateVideo(video.id, { name })
  }
  return { editing, setEditing, ref, commit }
}

interface CardProps {
  video: Video
  /** Stable getter for the surrounding list, so cards don't re-render when the array changes. */
  getList: () => Video[]
  index: number
  collection?: Collection
  onMenu: (e: MouseEvent, v: Video) => void
}

function useCardHandlers({ video, getList, collection }: CardProps) {
  const selected = useStore((s) => s.selection.has(video.id))
  const select = useStore((s) => s.select)
  const onClick = (e: MouseEvent) => {
    const ordered = getList().map((v) => v.id)
    if (e.shiftKey) select(video.id, 'range', ordered)
    else if (e.ctrlKey || e.metaKey) select(video.id, 'toggle')
    else select(video.id, 'single')
  }
  const onDoubleClick = () => !video.missing && playVideos(getList(), video.id, collection?.name)
  const onDragStart = (e: React.DragEvent) => {
    const sel = useStore.getState().selection
    const ids = sel.has(video.id) ? [...sel] : [video.id]
    e.dataTransfer.setData('application/x-lumina-videos', JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'copy'
  }
  return { selected, onClick, onDoubleClick, onDragStart }
}

export const VideoCard = memo(function VideoCard(props: CardProps) {
  const { video, index, onMenu, getList, collection } = props
  const { selected, onClick, onDoubleClick, onDragStart } = useCardHandlers(props)
  const { editing, ref, commit, setEditing } = useRename(video)
  const [preview, setPreview] = useState(false)
  const hoverTimer = useRef<number>()
  const reduceMotion = useStore((s) => s.lib?.settings.reduceMotion)
  // Never keep decoding a hover preview behind the player.
  const playerOpen = useStore((s) => !!s.player)
  const res = resolutionLabel(video.height, video.width)
  const progress = video.duration && video.position ? video.position / video.duration : 0

  return (
    <div
      style={{ animationDelay: `${Math.min(index * 20, 350)}ms` }}
      className={`video-card ${selected ? 'selected' : ''} ${video.missing ? 'missing' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => onMenu(e, video)}
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => {
        if (video.missing || reduceMotion) return
        hoverTimer.current = window.setTimeout(() => setPreview(true), 850)
      }}
      onMouseLeave={() => {
        clearTimeout(hoverTimer.current)
        setPreview(false)
      }}
      data-testid="video-card"
    >
      <div className="video-media">
        <Thumb video={video} />
        {preview && !playerOpen && (
          <video
            className="hover-preview"
            src={`${videoUrl(video.id)}`}
            muted
            autoPlay
            loop
            onLoadedMetadata={(e) => {
              const el = e.currentTarget
              if (Number.isFinite(el.duration)) el.currentTime = el.duration * 0.3
            }}
          />
        )}
        <div className="video-media-shade" />
        <button
          className="video-play"
          onClick={(e) => {
            e.stopPropagation()
            playVideos(getList(), video.id, collection?.name)
          }}
          disabled={video.missing}
          aria-label="Play"
        >
          <Play size={22} fill="currentColor" />
        </button>
        <div className="badges">
          {res && <span className="badge">{res}</span>}
          <span className="badge dark">{formatDuration(video.duration)}</span>
        </div>
        <button
          className={`fav-btn ${video.favorite ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            void api.updateVideo(video.id, { favorite: !video.favorite })
          }}
          aria-label="Favorite"
        >
          <Heart size={15} fill={video.favorite ? 'currentColor' : 'none'} />
        </button>
        {video.watched && (
          <span className="watched-chip">
            <Check size={12} /> Watched
          </span>
        )}
        {video.missing && <span className="missing-chip">File missing</span>}
        {progress > 0.01 && (
          <div className="resume-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {selected && (
          <span className="select-check">
            <Check size={14} />
          </span>
        )}
      </div>
      <div className="video-meta">
        {editing ? (
          <input
            className="rename-input"
            autoFocus
            defaultValue={video.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(e.currentTarget.value)
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <h4
            ref={ref as React.RefObject<HTMLHeadingElement>}
            data-video-title={video.id}
            title={video.name}
            onDoubleClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
          >
            {video.name}
          </h4>
        )}
        <p>
          <span className="ext">{video.ext}</span>
          {formatBytes(video.size)}
          {video.lastPlayedAt ? <> · played {timeAgo(video.lastPlayedAt)}</> : <> · added {timeAgo(video.addedAt)}</>}
        </p>
      </div>
    </div>
  )
})

export const VideoRow = memo(function VideoRow(props: CardProps) {
  const { video, onMenu, getList, collection } = props
  const { selected, onClick, onDoubleClick, onDragStart } = useCardHandlers(props)
  const { editing, ref, commit, setEditing } = useRename(video)
  const progress = video.duration && video.position ? video.position / video.duration : 0
  return (
    <div
      className={`video-row ${selected ? 'selected' : ''} ${video.missing ? 'missing' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => onMenu(e, video)}
      draggable
      onDragStart={onDragStart}
      data-testid="video-row"
    >
      <div className="row-thumb">
        <Thumb video={video} />
        <button
          className="row-play"
          onClick={(e) => {
            e.stopPropagation()
            playVideos(getList(), video.id, collection?.name)
          }}
        >
          <Play size={14} fill="currentColor" />
        </button>
        {progress > 0.01 && (
          <div className="resume-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <div className="row-title">
        {editing ? (
          <input
            className="rename-input"
            autoFocus
            defaultValue={video.name}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(e.currentTarget.value)
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span ref={ref as React.RefObject<HTMLSpanElement>} data-video-title={video.id} title={video.path}>
            {video.name}
          </span>
        )}
        {video.watched && <Check size={14} className="row-watched" />}
      </div>
      <span className="row-cell">{formatDuration(video.duration)}</span>
      <span className="row-cell">{resolutionLabel(video.height, video.width) ?? '—'}</span>
      <span className="row-cell">{formatBytes(video.size)}</span>
      <span className="row-cell">{timeAgo(video.lastPlayedAt)}</span>
      <button
        className={`fav-inline ${video.favorite ? 'on' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          void api.updateVideo(video.id, { favorite: !video.favorite })
        }}
      >
        <Heart size={15} fill={video.favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
})
