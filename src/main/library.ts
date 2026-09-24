import { createHash, randomUUID } from 'node:crypto'
import { existsSync, promises as fs } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import {
  COLLECTION_COLORS,
  DEFAULT_SETTINGS,
  type Collection,
  type CollectionPatch,
  type ImportOptions,
  type ImportResult,
  type Library,
  type Settings,
  type Video,
  type VideoPatch
} from '@shared/types'
import { scanPaths, type FoundFile } from './scanner'

const LIBRARY_VERSION = 1
const WATCHED_THRESHOLD = 0.92

export function videoIdFor(path: string): string {
  const normalized = process.platform === 'win32' ? path.toLowerCase() : path
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16)
}

export function prettyName(file: string): string {
  const raw = basename(file, extname(file))
  const cleaned = raw.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || raw
}

const EMOJIS = ['🎬', '🎞️', '📼', '🍿', '🎥', '✨', '🌌', '🎮', '🎵', '🏔️', '🌊', '🔥']

function emptyLibrary(): Library {
  return { version: LIBRARY_VERSION, videos: {}, collections: [], settings: { ...DEFAULT_SETTINGS } }
}

/**
 * Owns the on-disk library JSON. Every mutation marks the store dirty, and writes are
 * debounced + atomic (write temp file, then rename) so a crash never corrupts the library.
 */
export class LibraryStore {
  lib: Library = emptyLibrary()
  private saveTimer: NodeJS.Timeout | null = null
  private listeners = new Set<(lib: Library) => void>()

  constructor(
    private readonly file: string,
    private readonly saveDelay = 400
  ) {}

  get thumbsDir(): string {
    return join(dirname(this.file), 'thumbs')
  }

  thumbPath(videoId: string): string {
    return join(this.thumbsDir, `${videoId}.jpg`)
  }

  async load(): Promise<Library> {
    try {
      const raw = JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<Library>
      this.lib = {
        version: LIBRARY_VERSION,
        videos: raw.videos ?? {},
        collections: raw.collections ?? [],
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Keep the unreadable file around for manual recovery rather than silently losing it.
        await fs.copyFile(this.file, `${this.file}.corrupt-${Date.now()}`).catch(() => {})
      }
      this.lib = emptyLibrary()
    }
    for (const v of Object.values(this.lib.videos)) v.missing = !existsSync(v.path)
    return this.lib
  }

  onChange(cb: (lib: Library) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  /** Mark dirty; `broadcast` false is used for high-frequency updates like playback progress. */
  private touch(broadcast = true): void {
    if (broadcast) for (const l of this.listeners) l(this.lib)
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.flush(), this.saveDelay)
  }

  async flush(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    await fs.mkdir(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.lib))
    await fs.rename(tmp, this.file)
  }

  // ---------------------------------------------------------------- collections

  private findCollection(id: string): Collection {
    const c = this.lib.collections.find((x) => x.id === id)
    if (!c) throw new Error(`Collection not found: ${id}`)
    return c
  }

  createCollection(input: CollectionPatch & { name: string; sourceFolder?: string }): Collection {
    const now = Date.now()
    const n = this.lib.collections.length
    const c: Collection = {
      id: randomUUID(),
      name: input.name.trim() || 'Untitled',
      description: input.description ?? '',
      color: input.color ?? COLLECTION_COLORS[n % COLLECTION_COLORS.length],
      emoji: input.emoji ?? EMOJIS[n % EMOJIS.length],
      coverVideoId: input.coverVideoId,
      videoIds: [],
      sourceFolder: input.sourceFolder,
      pinned: input.pinned ?? false,
      createdAt: now,
      updatedAt: now
    }
    this.lib.collections.push(c)
    this.touch()
    return c
  }

  updateCollection(id: string, patch: CollectionPatch): void {
    const c = this.findCollection(id)
    Object.assign(c, patch, { updatedAt: Date.now() })
    if (patch.name !== undefined) c.name = patch.name.trim() || c.name
    this.touch()
  }

  deleteCollection(id: string): void {
    this.lib.collections = this.lib.collections.filter((c) => c.id !== id)
    this.touch()
  }

  reorderCollections(ids: string[]): void {
    const order = new Map(ids.map((id, i) => [id, i]))
    this.lib.collections.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9))
    this.touch()
  }

  addToCollection(id: string, videoIds: string[]): void {
    const c = this.findCollection(id)
    const existing = new Set(c.videoIds)
    for (const v of videoIds) {
      if (this.lib.videos[v] && !existing.has(v)) {
        c.videoIds.push(v)
        existing.add(v)
      }
    }
    c.updatedAt = Date.now()
    this.touch()
  }

  removeFromCollection(id: string, videoIds: string[]): void {
    const c = this.findCollection(id)
    const drop = new Set(videoIds)
    c.videoIds = c.videoIds.filter((v) => !drop.has(v))
    if (c.coverVideoId && drop.has(c.coverVideoId)) c.coverVideoId = undefined
    c.updatedAt = Date.now()
    this.touch()
  }

  // ---------------------------------------------------------------- videos

  private upsertVideo(f: FoundFile): { video: Video; isNew: boolean } {
    const id = videoIdFor(f.path)
    const existing = this.lib.videos[id]
    if (existing) {
      existing.missing = false
      if (existing.size !== f.size || existing.mtime !== f.mtime) {
        Object.assign(existing, { size: f.size, mtime: f.mtime, thumbAt: undefined, thumbFailed: false })
      }
      return { video: existing, isNew: false }
    }
    const video: Video = {
      id,
      path: f.path,
      name: prettyName(f.path),
      ext: extname(f.path).slice(1).toLowerCase(),
      size: f.size,
      mtime: f.mtime,
      addedAt: Date.now(),
      favorite: false,
      rating: 0,
      tags: [],
      playCount: 0,
      position: 0,
      watched: false
    }
    this.lib.videos[id] = video
    return { video, isNew: true }
  }

  /** Register loose files (e.g. opened via file association) without touching collections. */
  async registerFiles(paths: string[]): Promise<string[]> {
    const found = await scanPaths(paths)
    const ids = found.map((f) => this.upsertVideo(f).video.id)
    if (ids.length) this.touch()
    return ids
  }

  async importPaths(paths: string[], opts: ImportOptions): Promise<ImportResult> {
    const result: ImportResult = { added: 0, skipped: 0, collectionsCreated: 0, collectionIds: [] }
    const groups = new Map<string, { label: string; source?: string; files: FoundFile[] }>()

    for (const root of paths) {
      const stat = await fs.stat(root).catch(() => null)
      if (!stat) continue
      const files = await scanPaths([root])
      if (!stat.isDirectory()) {
        const key = '__loose__'
        const g = groups.get(key) ?? { label: 'Imported videos', files: [] }
        g.files.push(...files)
        groups.set(key, g)
        continue
      }
      for (const f of files) {
        const folder = dirname(f.path)
        const key = opts.splitSubfolders ? folder : root
        let g = groups.get(key)
        if (!g) {
          const rel = relative(root, folder)
          const label = opts.splitSubfolders && rel ? rel.split(sep).join(' › ') : basename(root) || root
          g = { label, source: key, files: [] }
          groups.set(key, g)
        }
        g.files.push(f)
      }
    }

    for (const g of groups.values()) {
      const ids: string[] = []
      for (const f of g.files) {
        const { video, isNew } = this.upsertVideo(f)
        if (isNew) result.added++
        else result.skipped++
        ids.push(video.id)
      }
      if (!ids.length) continue
      let target: Collection | undefined
      if (opts.targetCollectionId) target = this.findCollection(opts.targetCollectionId)
      else if (g.source) target = this.lib.collections.find((c) => c.sourceFolder === g.source)
      if (!target) {
        target = this.createCollection({ name: g.label, sourceFolder: g.source })
        result.collectionsCreated++
      }
      this.addToCollection(target.id, ids)
      if (!result.collectionIds.includes(target.id)) result.collectionIds.push(target.id)
    }
    this.touch()
    return result
  }

  async rescanCollection(id: string): Promise<ImportResult> {
    const c = this.findCollection(id)
    if (!c.sourceFolder) throw new Error('This collection is not linked to a folder')
    for (const vid of c.videoIds) {
      const v = this.lib.videos[vid]
      if (v) v.missing = !existsSync(v.path)
    }
    return this.importPaths([c.sourceFolder], { splitSubfolders: false, targetCollectionId: id })
  }

  updateVideo(id: string, patch: VideoPatch): void {
    const v = this.lib.videos[id]
    if (!v) return
    Object.assign(v, patch)
    if (patch.rating !== undefined) v.rating = Math.max(0, Math.min(5, Math.round(patch.rating)))
    if (patch.watched === false) v.position = 0
    this.touch()
  }

  async removeVideos(ids: string[]): Promise<void> {
    const drop = new Set(ids)
    for (const id of ids) {
      delete this.lib.videos[id]
      await fs.rm(this.thumbPath(id), { force: true })
    }
    for (const c of this.lib.collections) {
      c.videoIds = c.videoIds.filter((v) => !drop.has(v))
      if (c.coverVideoId && drop.has(c.coverVideoId)) c.coverVideoId = undefined
    }
    this.touch()
  }

  saveProgress(id: string, position: number, duration: number): void {
    const v = this.lib.videos[id]
    if (!v) return
    if (duration > 0 && Number.isFinite(duration)) v.duration = duration
    const done = duration > 0 && position / duration >= WATCHED_THRESHOLD
    if (done) {
      v.watched = true
      v.position = 0
    } else {
      v.position = Math.max(0, position)
    }
    this.touch(done)
  }

  markPlayed(id: string): void {
    const v = this.lib.videos[id]
    if (!v) return
    v.playCount++
    v.lastPlayedAt = Date.now()
    this.touch()
  }

  async saveThumb(p: {
    videoId: string
    jpeg?: Buffer
    duration?: number
    width?: number
    height?: number
    failed?: boolean
  }): Promise<void> {
    const v = this.lib.videos[p.videoId]
    if (!v) return
    if (p.duration && Number.isFinite(p.duration)) v.duration = p.duration
    if (p.width) v.width = p.width
    if (p.height) v.height = p.height
    if (p.jpeg) {
      await fs.mkdir(this.thumbsDir, { recursive: true })
      await fs.writeFile(this.thumbPath(v.id), p.jpeg)
      v.thumbAt = Date.now()
      v.thumbFailed = false
    } else if (p.failed) {
      v.thumbFailed = true
    }
    this.touch()
  }

  async resetThumbs(): Promise<void> {
    await fs.rm(this.thumbsDir, { recursive: true, force: true })
    for (const v of Object.values(this.lib.videos)) {
      v.thumbAt = undefined
      v.thumbFailed = false
    }
    this.touch()
  }

  async cleanupMissing(): Promise<number> {
    const missing = Object.values(this.lib.videos)
      .filter((v) => !existsSync(v.path))
      .map((v) => v.id)
    await this.removeVideos(missing)
    return missing.length
  }

  updateSettings(patch: Partial<Settings>): void {
    this.lib.settings = { ...this.lib.settings, ...patch }
    this.touch()
  }
}
