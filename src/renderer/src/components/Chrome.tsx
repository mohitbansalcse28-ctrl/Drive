import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  Clapperboard,
  Copy,
  FilePlus2,
  FolderPlus,
  Heart,
  History,
  Home,
  LayoutGrid,
  Minus,
  Plus,
  Search,
  Settings,
  Square,
  X
} from 'lucide-react'
import { api, useStore, type Route } from '../store'
import { collectionMenu, importFiles, importFolder } from '../lib/actions'
import { COLLECTION_GRADIENTS, formatBytes } from '../lib/format'
import { Logo } from './Logo'

export function TitleBar() {
  const history = useStore((s) => s.history)
  const back = useStore((s) => s.back)
  const setPalette = useStore((s) => s.setPalette)
  const [max, setMax] = useState(false)
  const nativeControls = api.platform === 'win32' || api.platform === 'darwin'

  useEffect(() => {
    void api.win.isMaximized().then(setMax)
    return api.win.onMaximized(setMax)
  }, [])

  return (
    <header className="titlebar" onDoubleClick={() => !nativeControls && api.win.toggleMaximize()}>
      <div className="titlebar-brand">
        <Logo size={22} />
        <span className="brand-name">Lumina</span>
      </div>
      <button className="icon-btn no-drag" disabled={!history.length} onClick={back} title="Back (Alt+←)">
        <ChevronLeft size={18} />
      </button>
      <button className="search-trigger no-drag" onClick={() => setPalette(true)} data-testid="search-trigger">
        <Search size={15} />
        <span>Search videos, collections, tags…</span>
        <kbd>Ctrl K</kbd>
      </button>
      <div className="titlebar-spacer" />
      {!nativeControls && (
        <div className="win-controls no-drag">
          <button onClick={api.win.minimize} title="Minimize">
            <Minus size={15} />
          </button>
          <button onClick={api.win.toggleMaximize} title={max ? 'Restore' : 'Maximize'}>
            {max ? <Copy size={13} /> : <Square size={13} />}
          </button>
          <button className="close" onClick={api.win.close} title="Close">
            <X size={16} />
          </button>
        </div>
      )}
      {api.platform === 'win32' && <div className="wco-spacer" />}
    </header>
  )
}

const NAV: { route: Route; label: string; icon: JSX.Element }[] = [
  { route: { name: 'home' }, label: 'Home', icon: <Home size={18} /> },
  { route: { name: 'collections' }, label: 'Collections', icon: <LayoutGrid size={18} /> },
  { route: { name: 'all' }, label: 'All videos', icon: <Clapperboard size={18} /> },
  { route: { name: 'favorites' }, label: 'Favorites', icon: <Heart size={18} /> },
  { route: { name: 'recent' }, label: 'Recently played', icon: <History size={18} /> }
]

export function Sidebar() {
  const lib = useStore((s) => s.lib)
  const route = useStore((s) => s.route)
  const navigate = useStore((s) => s.navigate)
  const openMenu = useStore((s) => s.openMenu)
  const openModal = useStore((s) => s.openModal)
  const toast = useStore((s) => s.toast)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  if (!lib) return null

  const videos = Object.values(lib.videos)
  const totalSize = videos.reduce((a, v) => a + v.size, 0)
  const counts: Record<string, number> = {
    all: videos.length,
    favorites: videos.filter((v) => v.favorite).length,
    recent: videos.filter((v) => v.lastPlayedAt).length,
    collections: lib.collections.length
  }
  const collections = [...lib.collections].sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <aside className="sidebar">
      <nav className="nav">
        {NAV.map((n) => {
          const active = route.name === n.route.name
          return (
            <button
              key={n.route.name}
              className={`nav-item ${active ? 'active' : ''}`}
              onClick={() => navigate(n.route)}
              data-testid={`nav-${n.route.name}`}
            >
              {active && <motion.span layoutId="nav-glow" className="nav-glow" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {counts[n.route.name] !== undefined && counts[n.route.name] > 0 && (
                <span className="nav-count">{counts[n.route.name]}</span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-section">
        <span>Collections</span>
        <button className="icon-btn sm" title="New collection" onClick={() => openModal({ kind: 'collection' })} data-testid="new-collection">
          <Plus size={15} />
        </button>
      </div>
      <div className="collection-list">
        {collections.map((c) => {
          const [a, b] = COLLECTION_GRADIENTS[c.color]
          const active = route.name === 'collection' && route.id === c.id
          return (
            <button
              key={c.id}
              className={`collection-link ${active ? 'active' : ''} ${dropTarget === c.id ? 'drop' : ''}`}
              onClick={() => navigate({ name: 'collection', id: c.id })}
              onContextMenu={(e) => {
                e.preventDefault()
                openMenu(e.clientX, e.clientY, collectionMenu(c))
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-lumina-videos')) {
                  e.preventDefault()
                  setDropTarget(c.id)
                }
              }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={async (e) => {
                setDropTarget(null)
                const raw = e.dataTransfer.getData('application/x-lumina-videos')
                if (!raw) return
                e.preventDefault()
                e.stopPropagation()
                const ids = JSON.parse(raw) as string[]
                await api.addToCollection(c.id, ids)
                toast(`Added ${ids.length} to ${c.name}`, 'success')
              }}
            >
              <span className="collection-swatch" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
                {c.emoji}
              </span>
              <span className="collection-link-name">{c.name}</span>
              <span className="nav-count">{c.videoIds.length}</span>
            </button>
          )
        })}
        {!collections.length && <p className="sidebar-empty">No collections yet. Import a folder to begin.</p>}
      </div>

      <div className="sidebar-actions">
        <button className="btn primary block" onClick={() => importFolder()} data-testid="import-folder">
          <FolderPlus size={16} /> Import folder
        </button>
        <button className="btn ghost block" onClick={() => importFiles()}>
          <FilePlus2 size={16} /> Add files
        </button>
      </div>

      <footer className="sidebar-footer">
        <button className={`nav-item ${route.name === 'settings' ? 'active' : ''}`} onClick={() => navigate({ name: 'settings' })} data-testid="nav-settings">
          {route.name === 'settings' && <motion.span layoutId="nav-glow" className="nav-glow" />}
          <span className="nav-icon">
            <Settings size={18} />
          </span>
          <span className="nav-label">Settings</span>
        </button>
        <div className="storage-meter">
          <div className="storage-row">
            <span>{videos.length} videos</span>
            <span>{formatBytes(totalSize)}</span>
          </div>
          <div className="storage-bar">
            <span style={{ width: `${Math.min(100, (totalSize / 1024 ** 4) * 100 + 4)}%` }} />
          </div>
        </div>
      </footer>
    </aside>
  )
}
