import { create } from 'zustand'
import type { ReactNode } from 'react'
import type { Collection, Library, SortKey, Video } from '@shared/types'

export type Route =
  | { name: 'home' }
  | { name: 'collections' }
  | { name: 'collection'; id: string }
  | { name: 'all' }
  | { name: 'favorites' }
  | { name: 'recent' }
  | { name: 'settings' }

export interface Toast {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  run?: () => void
  submenu?: MenuItem[]
  divider?: boolean
}

export type Modal =
  | { kind: 'collection'; collection?: Collection; addVideoIds?: string[] }
  | { kind: 'import'; paths: string[]; targetCollectionId?: string }
  | { kind: 'confirm'; title: string; body: string; confirmLabel: string; danger?: boolean; run: () => void }
  | { kind: 'info'; video: Video }
  | null

interface PlayerState {
  queue: string[]
  index: number
  sourceLabel: string
}

interface State {
  lib: Library | null
  route: Route
  history: Route[]
  search: string
  sort: SortKey
  sortDesc: boolean
  viewMode: 'grid' | 'list'
  selection: Set<string>
  player: PlayerState | null
  toasts: Toast[]
  modal: Modal
  menu: { x: number; y: number; items: MenuItem[] } | null
  palette: boolean

  setLib(lib: Library): void
  patchVideo(id: string, patch: Partial<Video>): void
  navigate(route: Route): void
  back(): void
  setSearch(q: string): void
  setSort(key: SortKey): void
  setViewMode(mode: 'grid' | 'list'): void
  select(id: string, mode: 'single' | 'toggle' | 'range', ordered?: string[]): void
  selectAll(ids: string[]): void
  clearSelection(): void
  play(queue: string[], index?: number, sourceLabel?: string): void
  setPlayerIndex(index: number): void
  closePlayer(): void
  toast(message: string, kind?: Toast['kind'], action?: Toast['action']): void
  dismissToast(id: number): void
  openModal(modal: Modal): void
  openMenu(x: number, y: number, items: MenuItem[]): void
  closeMenu(): void
  setPalette(open: boolean): void
}

let toastSeq = 0
let lastSelected: string | null = null

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(`lumina.${key}`)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

function writePref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`lumina.${key}`, JSON.stringify(value))
  } catch {
    /* preferences are best-effort */
  }
}

export const useStore = create<State>((set, get) => ({
  lib: null,
  route: { name: 'home' },
  history: [],
  search: '',
  sort: readPref<SortKey>('sort', 'name'),
  sortDesc: readPref('sortDesc', false),
  viewMode: readPref<'grid' | 'list'>('viewMode', 'grid'),
  selection: new Set(),
  player: null,
  toasts: [],
  modal: null,
  menu: null,
  palette: false,

  setLib: (lib) => set({ lib }),
  patchVideo: (id, patch) =>
    set((s) => {
      if (!s.lib?.videos[id]) return s
      const videos = { ...s.lib.videos, [id]: { ...s.lib.videos[id], ...patch } }
      return { lib: { ...s.lib, videos } }
    }),
  navigate: (route) =>
    set((s) =>
      JSON.stringify(route) === JSON.stringify(s.route)
        ? s
        : { route, history: [...s.history.slice(-30), s.route], selection: new Set(), search: '' }
    ),
  back: () =>
    set((s) => {
      const prev = s.history[s.history.length - 1]
      return prev ? { route: prev, history: s.history.slice(0, -1), selection: new Set() } : s
    }),
  setSearch: (search) => set({ search }),
  setSort: (key) => {
    const s = get()
    const sortDesc = s.sort === key ? !s.sortDesc : key !== 'name'
    writePref('sort', key)
    writePref('sortDesc', sortDesc)
    set({ sort: key, sortDesc })
  },
  setViewMode: (viewMode) => {
    writePref('viewMode', viewMode)
    set({ viewMode })
  },
  select: (id, mode, ordered = []) =>
    set((s) => {
      const next = new Set(mode === 'single' ? [] : s.selection)
      if (mode === 'range' && lastSelected && ordered.length) {
        const a = ordered.indexOf(lastSelected)
        const b = ordered.indexOf(id)
        if (a >= 0 && b >= 0) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) next.add(ordered[i])
          return { selection: next }
        }
      }
      if (mode === 'toggle' && next.has(id)) next.delete(id)
      else next.add(id)
      lastSelected = id
      return { selection: next }
    }),
  selectAll: (ids) => set({ selection: new Set(ids) }),
  clearSelection: () => set({ selection: new Set() }),
  play: (queue, index = 0, sourceLabel = 'Library') =>
    set({ player: { queue, index: Math.max(0, Math.min(index, queue.length - 1)), sourceLabel }, menu: null }),
  setPlayerIndex: (index) => set((s) => (s.player ? { player: { ...s.player, index } } : s)),
  closePlayer: () => set({ player: null }),
  toast: (message, kind = 'info', action) => {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, message, kind, action }] }))
    setTimeout(() => get().dismissToast(id), action ? 6500 : 3800)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  openModal: (modal) => set({ modal, menu: null }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
  setPalette: (palette) => set({ palette })
}))

export const api = window.lumina

// ---------------------------------------------------------------- derived helpers

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export function sortVideos(videos: Video[], key: SortKey, desc: boolean): Video[] {
  const val = (v: Video): number | string => {
    switch (key) {
      case 'added':
        return v.addedAt
      case 'duration':
        return v.duration ?? 0
      case 'size':
        return v.size
      case 'played':
        return v.lastPlayedAt ?? 0
      default:
        return v.name
    }
  }
  const sorted = [...videos].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    return typeof x === 'string' ? collator.compare(x, y as string) : x - (y as number)
  })
  return desc ? sorted.reverse() : sorted
}

export function matchesSearch(v: Video, q: string): boolean {
  if (!q) return true
  const hay = `${v.name} ${v.tags.join(' ')} ${v.ext}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term))
}

export function collectionVideos(lib: Library, c: Collection): Video[] {
  return c.videoIds.map((id) => lib.videos[id]).filter((v): v is Video => !!v)
}

export function collectionStats(lib: Library, c: Collection) {
  const vids = collectionVideos(lib, c)
  const duration = vids.reduce((s, v) => s + (v.duration ?? 0), 0)
  const size = vids.reduce((s, v) => s + v.size, 0)
  const watched = vids.filter((v) => v.watched).length
  return { count: vids.length, duration, size, watched, vids }
}

/** Pick up to `n` videos to preview a collection: the cover first, then ones with thumbnails. */
export function previewVideos(lib: Library, c: Collection, n = 4): Video[] {
  const vids = collectionVideos(lib, c)
  const withThumb = vids.filter((v) => v.thumbAt)
  const cover = c.coverVideoId ? lib.videos[c.coverVideoId] : undefined
  const list = cover ? [cover, ...withThumb.filter((v) => v.id !== cover.id)] : withThumb
  return list.slice(0, n)
}
