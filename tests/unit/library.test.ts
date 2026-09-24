import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LibraryStore, prettyName, videoIdFor } from '../../src/main/library'
import { scanPaths, isVideoFile } from '../../src/main/scanner'
import { parseRange, serveFile, mimeFor } from '../../src/main/media-protocol'
import { srtToVtt, toVtt } from '../../src/main/subtitles'

let dir: string

function touch(path: string, bytes = 16) {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, Buffer.alloc(bytes, 1))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'lumina-test-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('scanner', () => {
  it('recognises video extensions case-insensitively', () => {
    expect(isVideoFile('a/B.MP4')).toBe(true)
    expect(isVideoFile('clip.mkv')).toBe(true)
    expect(isVideoFile('notes.txt')).toBe(false)
    expect(isVideoFile('movie.srt')).toBe(false)
  })

  it('walks folders recursively, skips hidden dirs and sorts naturally', async () => {
    const media = join(dir, 'media')
    touch(join(media, 'Episode 10.mp4'))
    touch(join(media, 'Episode 2.mp4'))
    touch(join(media, 'Season 2', 'Episode 1.mkv'))
    touch(join(media, '.hidden', 'secret.mp4'))
    touch(join(media, 'readme.txt'))
    const found = await scanPaths([media])
    expect(found.map((f) => f.path.slice(media.length + 1))).toEqual([
      'Episode 2.mp4',
      'Episode 10.mp4',
      join('Season 2', 'Episode 1.mkv')
    ])
  })
})

describe('LibraryStore', () => {
  const libFile = () => join(dir, 'data', 'library.json')

  async function seeded() {
    const media = join(dir, 'Movies')
    touch(join(media, 'my_holiday.video.mp4'))
    touch(join(media, 'Trips', 'beach.webm'))
    touch(join(media, 'Trips', 'hike.mkv'))
    const store = new LibraryStore(libFile(), 5)
    await store.load()
    return { store, media }
  }

  it('prettifies names and derives stable ids', () => {
    expect(prettyName('/x/my_holiday.video.mp4')).toBe('my holiday video')
    expect(videoIdFor('/a/b.mp4')).toBe(videoIdFor('/a/b.mp4'))
    expect(videoIdFor('/a/b.mp4')).not.toBe(videoIdFor('/a/c.mp4'))
  })

  it('imports a folder as a single collection', async () => {
    const { store, media } = await seeded()
    const r = await store.importPaths([media], { splitSubfolders: false })
    expect(r).toMatchObject({ added: 3, skipped: 0, collectionsCreated: 1 })
    expect(store.lib.collections).toHaveLength(1)
    expect(store.lib.collections[0].name).toBe('Movies')
    expect(store.lib.collections[0].videoIds).toHaveLength(3)
    expect(store.lib.collections[0].sourceFolder).toBe(media)
  })

  it('splits sub-folders into separate collections and is idempotent', async () => {
    const { store, media } = await seeded()
    const r1 = await store.importPaths([media], { splitSubfolders: true })
    expect(r1.collectionsCreated).toBe(2)
    expect(store.lib.collections.map((c) => c.name).sort()).toEqual(['Movies', 'Trips'])
    const r2 = await store.importPaths([media], { splitSubfolders: true })
    expect(r2).toMatchObject({ added: 0, skipped: 3, collectionsCreated: 0 })
    expect(Object.keys(store.lib.videos)).toHaveLength(3)
  })

  it('rescans a linked collection and picks up new files', async () => {
    const { store, media } = await seeded()
    await store.importPaths([media], { splitSubfolders: false })
    const c = store.lib.collections[0]
    touch(join(media, 'new one.mp4'))
    const r = await store.rescanCollection(c.id)
    expect(r.added).toBe(1)
    expect(store.lib.collections).toHaveLength(1)
    expect(store.lib.collections[0].videoIds).toHaveLength(4)
  })

  it('manages collection membership, covers and deletion', async () => {
    const { store, media } = await seeded()
    await store.importPaths([media], { splitSubfolders: false })
    const [a, b] = Object.keys(store.lib.videos)
    const c = store.createCollection({ name: '  Favourites  ' })
    expect(c.name).toBe('Favourites')
    store.addToCollection(c.id, [a, b, a, 'nope'])
    expect(c.videoIds).toEqual([a, b])
    store.updateCollection(c.id, { coverVideoId: a, emoji: '🔥' })
    store.removeFromCollection(c.id, [a])
    expect(c.videoIds).toEqual([b])
    expect(c.coverVideoId).toBeUndefined()
    store.reorderCollections([c.id, store.lib.collections[0].id])
    expect(store.lib.collections[0].id).toBe(c.id)
    store.deleteCollection(c.id)
    expect(store.lib.collections.find((x) => x.id === c.id)).toBeUndefined()
    expect(Object.keys(store.lib.videos)).toHaveLength(3)
  })

  it('tracks progress, marks watched near the end and counts plays', async () => {
    const { store, media } = await seeded()
    await store.importPaths([media], { splitSubfolders: false })
    const id = Object.keys(store.lib.videos)[0]
    store.markPlayed(id)
    store.saveProgress(id, 30, 100)
    expect(store.lib.videos[id]).toMatchObject({ position: 30, duration: 100, watched: false, playCount: 1 })
    store.saveProgress(id, 95, 100)
    expect(store.lib.videos[id]).toMatchObject({ position: 0, watched: true })
    store.updateVideo(id, { rating: 9, favorite: true, tags: ['fun'] })
    expect(store.lib.videos[id]).toMatchObject({ rating: 5, favorite: true, tags: ['fun'] })
  })

  it('persists atomically and reloads, flagging missing files', async () => {
    const { store, media } = await seeded()
    await store.importPaths([media], { splitSubfolders: false })
    store.updateSettings({ theme: 'sunset' })
    await store.flush()
    expect(existsSync(libFile())).toBe(true)
    rmSync(join(media, 'Trips', 'hike.mkv'))

    const again = new LibraryStore(libFile())
    await again.load()
    expect(again.lib.settings.theme).toBe('sunset')
    expect(again.lib.settings.autoplayNext).toBe(true)
    const missing = Object.values(again.lib.videos).filter((v) => v.missing)
    expect(missing).toHaveLength(1)
    expect(await again.cleanupMissing()).toBe(1)
    expect(again.lib.collections[0].videoIds).toHaveLength(2)
  })

  it('saves thumbnails and metadata, and removes them with the video', async () => {
    const { store, media } = await seeded()
    await store.importPaths([media], { splitSubfolders: false })
    const id = Object.keys(store.lib.videos)[0]
    await store.saveThumb({ videoId: id, jpeg: Buffer.from([1, 2, 3]), duration: 42, width: 1920, height: 1080 })
    expect(store.lib.videos[id]).toMatchObject({ duration: 42, width: 1920, height: 1080 })
    expect(readFileSync(store.thumbPath(id))).toEqual(Buffer.from([1, 2, 3]))
    await store.removeVideos([id])
    expect(store.lib.videos[id]).toBeUndefined()
    expect(existsSync(store.thumbPath(id))).toBe(false)
    expect(store.lib.collections[0].videoIds).not.toContain(id)
  })

  it('backs up a corrupt library file instead of losing it', async () => {
    mkdirSync(join(dir, 'data'))
    writeFileSync(libFile(), '{ not json')
    const store = new LibraryStore(libFile())
    await store.load()
    expect(store.lib.collections).toEqual([])
    const { readdirSync } = await import('node:fs')
    expect(readdirSync(join(dir, 'data')).some((f) => f.includes('.corrupt-'))).toBe(true)
  })

  it('broadcasts changes to listeners', async () => {
    const { store } = await seeded()
    let calls = 0
    const off = store.onChange(() => calls++)
    store.createCollection({ name: 'x' })
    off()
    store.createCollection({ name: 'y' })
    expect(calls).toBe(1)
  })
})

describe('media protocol', () => {
  it('parses byte ranges', () => {
    expect(parseRange(null, 100)).toBeNull()
    expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 })
    expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 })
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 })
    expect(parseRange('bytes=200-', 100)).toBeNull()
    expect(parseRange('items=1-2', 100)).toBeNull()
  })

  it('serves full and partial content', async () => {
    const f = join(dir, 'clip.mp4')
    writeFileSync(f, Buffer.from('0123456789'))
    expect(mimeFor(f)).toBe('video/mp4')

    const full = await serveFile(f, null)
    expect(full.status).toBe(200)
    expect(await full.text()).toBe('0123456789')

    const part = await serveFile(f, 'bytes=2-5')
    expect(part.status).toBe(206)
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await part.text()).toBe('2345')

    expect((await serveFile(f, 'bytes=50-')).status).toBe(416)
    expect((await serveFile(join(dir, 'nope.mp4'), null)).status).toBe(404)
  })
})

describe('subtitles', () => {
  it('converts srt to vtt', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nHello\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nWorld\r\nline 2\r\n'
    expect(srtToVtt(srt)).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\nHello\n\n00:00:03.000 --> 00:00:04.000\nWorld\nline 2\n')
  })
  it('passes vtt through', () => {
    expect(toVtt('﻿WEBVTT\n\nx', 'VTT')).toBe('WEBVTT\n\nx')
  })
})
