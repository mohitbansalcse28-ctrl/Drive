import { useEffect, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import { api, useStore, collectionVideos } from './store'
import { useThumbnailEngine } from './lib/thumbs'
import { playVideos } from './lib/actions'
import { THEMES } from './lib/format'
import { Sidebar, TitleBar } from './components/Chrome'
import { CollectionsView, CollectionView, HomeView, VideosPage } from './components/Views'
import { SettingsView } from './components/SettingsView'
import { Player } from './components/Player'
import { CommandPalette, ContextMenu, DropZone, Modals, Toasts } from './components/Overlays'
import { Logo } from './components/Logo'

export default function App() {
  const lib = useStore((s) => s.lib)
  const route = useStore((s) => s.route)
  const player = useStore((s) => s.player)
  const setLib = useStore((s) => s.setLib)

  useThumbnailEngine()

  useEffect(() => {
    void api.getLibrary().then(setLib)
    const offLib = api.onLibrary(setLib)
    const offOpen = api.onOpenFiles((ids) => {
      const l = useStore.getState().lib
      if (l) playVideos(ids.map((id) => l.videos[id]).filter(Boolean), undefined, 'Opened files')
    })
    return () => {
      offLib()
      offOpen()
    }
  }, [setLib])

  // Global shortcuts (the player installs its own capturing handler while open).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        s.setPalette(!s.palette)
        return
      }
      if (s.player || typing || s.modal) return
      if (e.altKey && e.key === 'ArrowLeft') s.back()
      if (e.key === 'Escape') s.clearSelection()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const ids = [...document.querySelectorAll<HTMLElement>('[data-video-title]')].map((el) => el.dataset.videoTitle!)
        if (ids.length) {
          e.preventDefault()
          s.selectAll(ids)
        }
      }
      if (e.key === 'Delete' && s.selection.size && s.route.name === 'collection' && s.lib) {
        const c = s.lib.collections.find((x) => x.id === (s.route as { id: string }).id)
        if (c) void api.removeFromCollection(c.id, [...s.selection]).then(() => s.clearSelection())
      }
      if (e.key === 'Enter' && s.selection.size && s.lib) {
        const r = s.route
        const list = r.name === 'collection' ? collectionVideos(s.lib, s.lib.collections.find((c) => c.id === r.id)!) : Object.values(s.lib.videos)
        playVideos(list.filter((v) => s.selection.has(v.id)), undefined, 'Selection')
      }
    }
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3 && !useStore.getState().player) useStore.getState().back()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mouseup', onMouse)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mouseup', onMouse)
    }
  }, [])

  // Each page starts scrolled to the top.
  const contentRef = useRef<HTMLElement>(null)
  const routeKey = JSON.stringify(route)
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [routeKey])

  // Accent variables live on :root so derived tokens like --grad pick them up too.
  const themeName = lib?.settings.theme ?? 'aurora'
  useEffect(() => {
    const t = THEMES[themeName] ?? THEMES.aurora
    const rs = document.documentElement.style
    rs.setProperty('--accent', t.accent)
    rs.setProperty('--accent-2', t.accent2)
    rs.setProperty('--on-accent', t.on)
  }, [themeName])

  if (!lib) {
    return (
      <div className="splash">
        <Logo size={72} />
      </div>
    )
  }

  const key = route.name === 'collection' ? `c-${route.id}` : route.name

  return (
    <div className={`app ${lib.settings.reduceMotion ? 'reduce-motion' : ''}`}>
      <div className="backdrop" />
      <TitleBar />
      {/* While the player covers everything, skip rendering the library underneath. */}
      <div className="shell" style={player ? { contentVisibility: 'hidden' } : undefined}>
        <Sidebar />
        <main ref={contentRef} className="content" onMouseDown={(e) => e.target === e.currentTarget && useStore.getState().clearSelection()}>
          {/* Keyed so each page gets a short CSS entrance; no exit wait keeps navigation instant. */}
          <div key={key} className="route">
              {route.name === 'home' && <HomeView />}
              {route.name === 'collections' && <CollectionsView />}
              {route.name === 'collection' && <CollectionView id={route.id} />}
              {(route.name === 'all' || route.name === 'favorites' || route.name === 'recent') && <VideosPage kind={route.name} />}
              {route.name === 'settings' && <SettingsView />}
          </div>
        </main>
      </div>
      <AnimatePresence>{player && <Player key="player" player={player} />}</AnimatePresence>
      <DropZone />
      <Modals />
      <ContextMenu />
      <CommandPalette />
      <Toasts />
    </div>
  )
}
