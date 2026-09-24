import { useMemo, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Clapperboard,
  Clock,
  Edit3,
  FilePlus2,
  FolderPlus,
  HardDrive,
  Heart,
  History,
  LayoutGrid,
  List,
  MoreHorizontal,
  Play,
  RefreshCw,
  Shuffle,
  Sparkles,
  X
} from 'lucide-react'
import type { Collection, SortKey, Video } from '@shared/types'
import { collectionStats, matchesSearch, sortVideos, useStore } from '../store'
import { collectionMenu, importFiles, importFolder, playVideos, rescan, videoMenu } from '../lib/actions'
import {
  COLLECTION_GRADIENTS,
  formatBytes,
  formatDuration,
  formatLongDuration,
  thumbUrl,
  timeAgo
} from '../lib/format'
import { FolderCard, Thumb, VideoCard, VideoRow } from './Cards'
import { Logo } from './Logo'

// ---------------------------------------------------------------- shared bits

function EmptyState({ icon, title, body, children }: { icon: ReactNode; title: string; body: string; children?: ReactNode }) {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty-orb">{icon}</div>
      <h2>{title}</h2>
      <p>{body}</p>
      {children && <div className="empty-actions">{children}</div>}
    </motion.div>
  )
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'added', label: 'Date added' },
  { key: 'played', label: 'Last played' },
  { key: 'duration', label: 'Duration' },
  { key: 'size', label: 'Size' }
]

function Toolbar({ total, shown }: { total: number; shown: number }) {
  const { search, setSearch, sort, sortDesc, setSort, viewMode, setViewMode, selection, clearSelection } = useStore()
  return (
    <div className="toolbar">
      <div className="filter-box">
        <input
          placeholder="Filter this view…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="filter-input"
        />
        {search && (
          <button className="icon-btn sm" onClick={() => setSearch('')}>
            <X size={14} />
          </button>
        )}
      </div>
      <span className="toolbar-count">
        {shown === total ? `${total} videos` : `${shown} of ${total}`}
        {selection.size > 0 && (
          <button className="chip" onClick={clearSelection}>
            {selection.size} selected <X size={12} />
          </button>
        )}
      </span>
      <div className="toolbar-spacer" />
      <div className="segmented">
        {SORTS.map((s) => (
          <button key={s.key} className={sort === s.key ? 'on' : ''} onClick={() => setSort(s.key)}>
            {s.label}
            {sort === s.key && (sortDesc ? <ArrowDownWideNarrow size={13} /> : <ArrowUpNarrowWide size={13} />)}
          </button>
        ))}
      </div>
      <div className="segmented icons">
        <button className={viewMode === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')} title="Grid">
          <LayoutGrid size={15} />
        </button>
        <button className={viewMode === 'list' ? 'on' : ''} onClick={() => setViewMode('list')} title="List" data-testid="view-list">
          <List size={15} />
        </button>
      </div>
    </div>
  )
}

function VideoBrowser({
  videos,
  collection,
  keepOrder,
  empty
}: {
  videos: Video[]
  collection?: Collection
  keepOrder?: boolean
  empty?: ReactNode
}) {
  const { search, sort, sortDesc, viewMode, openMenu, select, selection } = useStore()
  const cardSize = useStore((s) => s.lib?.settings.cardSize ?? 240)
  const list = useMemo(() => {
    const filtered = videos.filter((v) => matchesSearch(v, search))
    return keepOrder ? filtered : sortVideos(filtered, sort, sortDesc)
  }, [videos, search, sort, sortDesc, keepOrder])

  const onMenu = (e: MouseEvent, v: Video) => {
    e.preventDefault()
    if (!selection.has(v.id)) select(v.id, 'single')
    openMenu(e.clientX, e.clientY, videoMenu(v, { list, collection }))
  }

  if (!videos.length) return <>{empty}</>
  return (
    <>
      <Toolbar total={videos.length} shown={list.length} />
      {viewMode === 'grid' ? (
        <div className="video-grid" style={{ '--card': `${cardSize}px` } as CSSProperties}>
          {list.map((v, i) => (
            <VideoCard key={v.id} video={v} list={list} index={i} collection={collection} onMenu={onMenu} />
          ))}
        </div>
      ) : (
        <div className="video-list">
          <div className="video-row head">
            <span />
            <span>Title</span>
            <span className="row-cell">Duration</span>
            <span className="row-cell">Quality</span>
            <span className="row-cell">Size</span>
            <span className="row-cell">Played</span>
            <span />
          </div>
          {list.map((v, i) => (
            <VideoRow key={v.id} video={v} list={list} index={i} collection={collection} onMenu={onMenu} />
          ))}
        </div>
      )}
      {!list.length && <p className="no-results">No videos match “{search}”.</p>}
    </>
  )
}

function PageHeader({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-icon">{icon}</div>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="toolbar-spacer" />
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- home

export function HomeView() {
  const lib = useStore((s) => s.lib)!
  const navigate = useStore((s) => s.navigate)
  const videos = useMemo(() => Object.values(lib.videos), [lib.videos])

  if (!videos.length) {
    return (
      <div className="page">
        <div className="welcome">
          <motion.div className="welcome-logo" initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 14 }}>
            <Logo size={96} />
          </motion.div>
          <h1 className="gradient-text">Welcome to Lumina</h1>
          <p>Your videos, beautifully organized. Import a folder and every sub-folder becomes a stunning collection card. Drop files anywhere to add them.</p>
          <div className="empty-actions">
            <button className="btn primary lg" onClick={() => importFolder()}>
              <FolderPlus size={18} /> Import a folder
            </button>
            <button className="btn ghost lg" onClick={() => importFiles()}>
              <FilePlus2 size={18} /> Add video files
            </button>
          </div>
          <div className="feature-row">
            {[
              ['🗂️', 'Folder cards', 'Collections with live thumbnail stacks'],
              ['🎬', 'Pro player', 'Speed, A-B loop, subtitles, snapshots'],
              ['⏯️', 'Resume', 'Picks up right where you left off'],
              ['✨', 'Ambient glow', 'The room lights up with your video']
            ].map(([e, t, d]) => (
              <div className="feature" key={t}>
                <span>{e}</span>
                <strong>{t}</strong>
                <small>{d}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const continueWatching = videos
    .filter((v) => v.position > 5 && !v.watched && !v.missing)
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
  const hero = continueWatching[0] ?? [...videos].filter((v) => v.thumbAt).sort((a, b) => b.addedAt - a.addedAt)[0] ?? videos[0]
  const recentAdded = [...videos].sort((a, b) => b.addedAt - a.addedAt).slice(0, 12)
  const totalDuration = videos.reduce((a, v) => a + (v.duration ?? 0), 0)
  const totalSize = videos.reduce((a, v) => a + v.size, 0)
  const watched = videos.filter((v) => v.watched).length
  const collections = [...lib.collections].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt).slice(0, 8)
  const heroProgress = hero.duration && hero.position ? hero.position / hero.duration : 0

  return (
    <div className="page home">
      <motion.section className="hero" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.5 }}>
        {hero.thumbAt && <img className="hero-bg" src={thumbUrl(hero.id, hero.thumbAt)} alt="" />}
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="eyebrow">
            <Sparkles size={13} /> {continueWatching.length ? 'Continue watching' : 'Fresh in your library'}
          </span>
          <h1>{hero.name}</h1>
          <p>
            {formatDuration(hero.duration)} · {formatBytes(hero.size)}
            {heroProgress > 0 && <> · {Math.round(heroProgress * 100)}% watched</>}
          </p>
          {heroProgress > 0 && (
            <div className="hero-progress">
              <span style={{ width: `${heroProgress * 100}%` }} />
            </div>
          )}
          <div className="hero-actions">
            <button className="btn primary lg" onClick={() => playVideos(continueWatching.length ? continueWatching : [hero], hero.id, 'Continue watching')} data-testid="hero-play">
              <Play size={18} fill="currentColor" /> {heroProgress > 0 ? 'Resume' : 'Play now'}
            </button>
            <button className="btn glass lg" onClick={() => playVideos([...videos].sort(() => Math.random() - 0.5), undefined, 'Shuffle')}>
              <Shuffle size={18} /> Shuffle all
            </button>
          </div>
        </div>
      </motion.section>

      <div className="stats">
        {[
          { icon: <Clapperboard size={18} />, label: 'Videos', value: String(videos.length) },
          { icon: <LayoutGrid size={18} />, label: 'Collections', value: String(lib.collections.length) },
          { icon: <Clock size={18} />, label: 'Total runtime', value: formatLongDuration(totalDuration) },
          { icon: <HardDrive size={18} />, label: 'Library size', value: formatBytes(totalSize) },
          { icon: <Heart size={18} />, label: 'Watched', value: `${Math.round((watched / videos.length) * 100)}%` }
        ].map((s, i) => (
          <motion.div className="stat" key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.05 }}>
            <span className="stat-icon">{s.icon}</span>
            <div>
              <strong>{s.value}</strong>
              <small>{s.label}</small>
            </div>
          </motion.div>
        ))}
      </div>

      {continueWatching.length > 1 && (
        <Shelf title="Continue watching" onMore={() => navigate({ name: 'recent' })}>
          {continueWatching.slice(0, 10).map((v) => (
            <MiniCard key={v.id} video={v} list={continueWatching} />
          ))}
        </Shelf>
      )}

      {collections.length > 0 && (
        <section className="shelf">
          <div className="shelf-head">
            <h2>Your collections</h2>
            <button className="link" onClick={() => navigate({ name: 'collections' })}>
              See all
            </button>
          </div>
          <div className="folder-grid compact">
            {collections.map((c, i) => (
              <FolderCard key={c.id} collection={c} index={i} />
            ))}
          </div>
        </section>
      )}

      <Shelf title="Recently added" onMore={() => navigate({ name: 'all' })}>
        {recentAdded.map((v) => (
          <MiniCard key={v.id} video={v} list={recentAdded} />
        ))}
      </Shelf>
    </div>
  )
}

function Shelf({ title, onMore, children }: { title: string; onMore?: () => void; children: ReactNode }) {
  return (
    <section className="shelf">
      <div className="shelf-head">
        <h2>{title}</h2>
        {onMore && (
          <button className="link" onClick={onMore}>
            See all
          </button>
        )}
      </div>
      <div className="shelf-row">{children}</div>
    </section>
  )
}

function MiniCard({ video, list }: { video: Video; list: Video[] }) {
  const progress = video.duration && video.position ? video.position / video.duration : 0
  return (
    <button className="mini-card" onClick={() => playVideos(list, video.id)} title={video.name}>
      <div className="video-media">
        <Thumb video={video} />
        <div className="video-media-shade" />
        <span className="video-play small">
          <Play size={16} fill="currentColor" />
        </span>
        <div className="badges">
          <span className="badge dark">{formatDuration(video.duration)}</span>
        </div>
        {progress > 0.01 && (
          <div className="resume-bar">
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>
      <span className="mini-title">{video.name}</span>
    </button>
  )
}

// ---------------------------------------------------------------- collections

export function CollectionsView() {
  const lib = useStore((s) => s.lib)!
  const openModal = useStore((s) => s.openModal)
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const collections = [...lib.collections]
    .filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <div className="page">
      <PageHeader icon={<LayoutGrid size={22} />} title="Collections" subtitle={`${lib.collections.length} collections · right-click a card for more`}>
        <div className="filter-box">
          <input placeholder="Find a collection…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="btn ghost" onClick={() => openModal({ kind: 'collection' })}>
          <FolderPlus size={16} /> New
        </button>
        <button className="btn primary" onClick={() => importFolder()}>
          <FolderPlus size={16} /> Import folder
        </button>
      </PageHeader>
      {lib.collections.length ? (
        <div className="folder-grid">
          {collections.map((c, i) => (
            <FolderCard key={c.id} collection={c} index={i} />
          ))}
          <button className="folder-new" onClick={() => openModal({ kind: 'collection' })}>
            <FolderPlus size={30} />
            <span>New collection</span>
          </button>
        </div>
      ) : (
        <EmptyState icon={<LayoutGrid size={34} />} title="No collections yet" body="Import a folder and Lumina turns it into a collection — or create an empty one and fill it by dragging videos onto it.">
          <button className="btn primary" onClick={() => importFolder()}>
            <FolderPlus size={16} /> Import folder
          </button>
          <button className="btn ghost" onClick={() => openModal({ kind: 'collection' })}>
            New empty collection
          </button>
        </EmptyState>
      )}
    </div>
  )
}

export function CollectionView({ id }: { id: string }) {
  const lib = useStore((s) => s.lib)!
  const openMenu = useStore((s) => s.openMenu)
  const openModal = useStore((s) => s.openModal)
  const collection = lib.collections.find((c) => c.id === id)
  const stats = useMemo(() => (collection ? collectionStats(lib, collection) : null), [lib, collection])
  if (!collection || !stats) {
    return (
      <div className="page">
        <EmptyState icon={<LayoutGrid size={34} />} title="Collection not found" body="It may have been deleted." />
      </div>
    )
  }
  const [a, b] = COLLECTION_GRADIENTS[collection.color]
  const cover = (collection.coverVideoId && lib.videos[collection.coverVideoId]) || stats.vids.find((v) => v.thumbAt)
  const resumeFrom = stats.vids.find((v) => v.position > 5 && !v.watched) ?? stats.vids.find((v) => !v.watched)

  return (
    <div className="page">
      <motion.section className="banner" style={{ '--fa': a, '--fb': b } as CSSProperties} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {cover?.thumbAt && <img className="banner-bg" src={thumbUrl(cover.id, cover.thumbAt)} alt="" />}
        <div className="banner-tint" />
        <div className="banner-content">
          <div className="banner-emoji">{collection.emoji}</div>
          <div className="banner-text">
            <span className="eyebrow">Collection{collection.sourceFolder ? ' · linked folder' : ''}</span>
            <h1 data-testid="collection-title">{collection.name}</h1>
            {collection.description && <p className="banner-desc">{collection.description}</p>}
            <p className="banner-meta">
              {stats.count} videos · {formatLongDuration(stats.duration)} · {formatBytes(stats.size)} · {stats.watched} watched · updated {timeAgo(collection.updatedAt)}
            </p>
          </div>
          <div className="banner-actions">
            <button className="btn primary lg" disabled={!stats.count} onClick={() => playVideos(stats.vids, resumeFrom?.id, collection.name)} data-testid="play-collection">
              <Play size={18} fill="currentColor" /> {resumeFrom && resumeFrom !== stats.vids[0] ? 'Continue' : 'Play all'}
            </button>
            <button className="btn glass" disabled={!stats.count} onClick={() => playVideos([...stats.vids].sort(() => Math.random() - 0.5), undefined, collection.name)}>
              <Shuffle size={16} />
            </button>
            {collection.sourceFolder && (
              <button className="btn glass" title="Rescan linked folder" onClick={() => rescan(collection)}>
                <RefreshCw size={16} />
              </button>
            )}
            <button className="btn glass" title="Edit" onClick={() => openModal({ kind: 'collection', collection })}>
              <Edit3 size={16} />
            </button>
            <button className="btn glass" onClick={(e) => openMenu(e.clientX, e.clientY, collectionMenu(collection))}>
              <MoreHorizontal size={16} />
            </button>
          </div>
        </div>
      </motion.section>
      <VideoBrowser
        videos={stats.vids}
        collection={collection}
        empty={
          <EmptyState icon={<Clapperboard size={34} />} title="This collection is empty" body="Add videos from disk, or drag videos from any view onto this collection in the sidebar.">
            <button className="btn primary" onClick={() => importFiles(collection.id)}>
              <FilePlus2 size={16} /> Add videos
            </button>
            <button className="btn ghost" onClick={() => importFolder(collection.id)}>
              <FolderPlus size={16} /> Add folder
            </button>
          </EmptyState>
        }
      />
    </div>
  )
}

export function VideosPage({ kind }: { kind: 'all' | 'favorites' | 'recent' }) {
  const lib = useStore((s) => s.lib)!
  const videos = useMemo(() => {
    const all = Object.values(lib.videos)
    if (kind === 'favorites') return all.filter((v) => v.favorite)
    if (kind === 'recent')
      return all.filter((v) => v.lastPlayedAt).sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
    return all
  }, [lib.videos, kind])
  const meta = {
    all: { icon: <Clapperboard size={22} />, title: 'All videos', empty: 'Your library is empty. Import a folder to get started.' },
    favorites: { icon: <Heart size={22} />, title: 'Favorites', empty: 'Tap the heart on any video to keep it here.' },
    recent: { icon: <History size={22} />, title: 'Recently played', empty: 'Videos you watch will show up here.' }
  }[kind]
  const duration = videos.reduce((a, v) => a + (v.duration ?? 0), 0)

  return (
    <div className="page">
      <PageHeader icon={meta.icon} title={meta.title} subtitle={`${videos.length} videos · ${formatLongDuration(duration)}`}>
        {videos.length > 0 && (
          <button className="btn primary" onClick={() => playVideos(videos, undefined, meta.title)}>
            <Play size={16} fill="currentColor" /> Play all
          </button>
        )}
      </PageHeader>
      <VideoBrowser
        videos={videos}
        keepOrder={kind === 'recent'}
        empty={<EmptyState icon={meta.icon} title={`Nothing in ${meta.title.toLowerCase()} yet`} body={meta.empty} />}
      />
    </div>
  )
}
