import {
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  FolderPlus,
  Heart,
  HeartOff,
  Image as ImageIcon,
  Info,
  ListPlus,
  Pin,
  PinOff,
  Play,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import type { Collection, Video } from '@shared/types'
import { api, useStore, type MenuItem } from '../store'

const s = () => useStore.getState()

export async function importWithDialog(paths: string[], targetCollectionId?: string): Promise<void> {
  if (!paths.length) return
  s().openModal({ kind: 'import', paths, targetCollectionId })
}

export async function runImport(paths: string[], splitSubfolders: boolean, targetCollectionId?: string) {
  s().toast(`Scanning ${paths.length > 1 ? `${paths.length} locations` : 'folder'} for videos…`)
  try {
    const r = await api.importPaths(paths, { splitSubfolders, targetCollectionId })
    if (!r.added && !r.skipped) return s().toast('No videos found there', 'error')
    const parts = [`${r.added} new video${r.added === 1 ? '' : 's'}`]
    if (r.collectionsCreated) parts.push(`${r.collectionsCreated} collection${r.collectionsCreated === 1 ? '' : 's'}`)
    s().toast(`Imported ${parts.join(' · ')}`, 'success')
    if (r.collectionIds.length === 1) s().navigate({ name: 'collection', id: r.collectionIds[0] })
    else if (r.collectionIds.length > 1) s().navigate({ name: 'collections' })
  } catch (err) {
    s().toast(`Import failed: ${(err as Error).message}`, 'error')
  }
}

export async function importFolder(targetCollectionId?: string) {
  const folder = await api.pickFolder()
  if (folder) await importWithDialog([folder], targetCollectionId)
}

export async function importFiles(targetCollectionId?: string) {
  const files = await api.pickFiles()
  if (files.length) await runImport(files, false, targetCollectionId)
}

export function playVideos(videos: Video[], startId?: string, label?: string) {
  const playable = videos.filter((v) => !v.missing)
  if (!playable.length) return s().toast('Nothing playable here', 'error')
  const idx = startId ? Math.max(0, playable.findIndex((v) => v.id === startId)) : 0
  s().play(
    playable.map((v) => v.id),
    idx,
    label
  )
}

export function toggleFavorite(ids: string[]) {
  const lib = s().lib
  if (!lib) return
  const allFav = ids.every((id) => lib.videos[id]?.favorite)
  for (const id of ids) void api.updateVideo(id, { favorite: !allFav })
  s().toast(allFav ? 'Removed from favorites' : 'Added to favorites ♥', 'success')
}

function addToMenu(ids: string[], exclude?: string): MenuItem[] {
  const lib = s().lib
  const items: MenuItem[] = (lib?.collections ?? [])
    .filter((c) => c.id !== exclude)
    .map((c) => ({
      label: `${c.emoji}  ${c.name}`,
      run: async () => {
        await api.addToCollection(c.id, ids)
        s().toast(`Added ${ids.length} to ${c.name}`, 'success')
      }
    }))
  return [
    ...items,
    ...(items.length ? [{ label: '', divider: true }] : []),
    {
      label: 'New collection…',
      icon: <FolderPlus size={15} />,
      run: () => s().openModal({ kind: 'collection', addVideoIds: ids })
    }
  ]
}

export function videoMenu(video: Video, context: { list: Video[]; collection?: Collection }): MenuItem[] {
  const sel = s().selection
  const ids = sel.has(video.id) && sel.size > 1 ? [...sel] : [video.id]
  const many = ids.length > 1
  const { collection, list } = context
  const items: MenuItem[] = [
    {
      label: many ? `Play ${ids.length} selected` : 'Play',
      icon: <Play size={15} />,
      disabled: video.missing,
      run: () =>
        many
          ? playVideos(list.filter((v) => ids.includes(v.id)), undefined, 'Selection')
          : playVideos(list, video.id, collection?.name)
    },
    {
      label: video.favorite && !many ? 'Remove favorite' : 'Favorite',
      icon: video.favorite && !many ? <HeartOff size={15} /> : <Heart size={15} />,
      run: () => toggleFavorite(ids)
    },
    {
      label: video.watched && !many ? 'Mark as unwatched' : 'Mark as watched',
      icon: video.watched && !many ? <EyeOff size={15} /> : <Eye size={15} />,
      run: () => ids.forEach((id) => void api.updateVideo(id, { watched: !(video.watched && !many) }))
    },
    { label: 'Add to collection', icon: <ListPlus size={15} />, submenu: addToMenu(ids, collection?.id) },
    { label: '', divider: true }
  ]
  if (!many) {
    items.push(
      {
        label: 'Rename',
        icon: <Edit3 size={15} />,
        run: () => {
          const el = document.querySelector<HTMLElement>(`[data-video-title="${video.id}"]`)
          el?.dispatchEvent(new CustomEvent('lumina:rename'))
        }
      },
      { label: 'Details', icon: <Info size={15} />, run: () => s().openModal({ kind: 'info', video }) },
      { label: 'Show in Explorer', icon: <FolderOpen size={15} />, run: () => api.showInFolder(video.id) },
      { label: 'Open with default app', icon: <ExternalLink size={15} />, run: () => api.openExternal(video.id) }
    )
    if (collection) {
      items.push({
        label: 'Set as collection cover',
        icon: <ImageIcon size={15} />,
        run: async () => {
          await api.updateCollection(collection.id, { coverVideoId: video.id })
          s().toast('Cover updated', 'success')
        }
      })
    }
    items.push({ label: '', divider: true })
  }
  if (collection) {
    items.push({
      label: many ? `Remove ${ids.length} from collection` : 'Remove from collection',
      icon: <X size={15} />,
      run: async () => {
        await api.removeFromCollection(collection.id, ids)
        s().clearSelection()
      }
    })
  }
  items.push({
    label: many ? `Remove ${ids.length} from library` : 'Remove from library',
    icon: <Trash2 size={15} />,
    danger: true,
    run: () =>
      s().openModal({
        kind: 'confirm',
        title: many ? `Remove ${ids.length} videos?` : `Remove “${video.name}”?`,
        body: 'They will be removed from Lumina and every collection. Files on disk are never deleted.',
        confirmLabel: 'Remove',
        danger: true,
        run: async () => {
          await api.removeVideos(ids)
          s().clearSelection()
        }
      })
  })
  return items
}

export function collectionMenu(c: Collection): MenuItem[] {
  const lib = s().lib
  const vids = lib ? c.videoIds.map((id) => lib.videos[id]).filter(Boolean) : []
  return [
    { label: 'Play all', icon: <Play size={15} />, run: () => playVideos(vids, undefined, c.name) },
    { label: 'Open', icon: <FolderOpen size={15} />, run: () => s().navigate({ name: 'collection', id: c.id }) },
    { label: 'Edit…', icon: <Edit3 size={15} />, run: () => s().openModal({ kind: 'collection', collection: c }) },
    {
      label: c.pinned ? 'Unpin' : 'Pin to top',
      icon: c.pinned ? <PinOff size={15} /> : <Pin size={15} />,
      run: () => api.updateCollection(c.id, { pinned: !c.pinned })
    },
    { label: '', divider: true },
    { label: 'Add videos…', icon: <Download size={15} />, run: () => importFiles(c.id) },
    { label: 'Add folder…', icon: <FolderPlus size={15} />, run: () => importFolder(c.id) },
    ...(c.sourceFolder
      ? [{ label: 'Rescan folder', icon: <RefreshCw size={15} />, run: () => rescan(c) }]
      : []),
    { label: '', divider: true },
    {
      label: 'Delete collection',
      icon: <Trash2 size={15} />,
      danger: true,
      run: () =>
        s().openModal({
          kind: 'confirm',
          title: `Delete “${c.name}”?`,
          body: 'The collection is removed; its videos stay in your library and on disk.',
          confirmLabel: 'Delete',
          danger: true,
          run: async () => {
            const r = s().route
            if (r.name === 'collection' && r.id === c.id) s().navigate({ name: 'collections' })
            await api.deleteCollection(c.id)
          }
        })
    }
  ]
}

export async function rescan(c: Collection) {
  try {
    const r = await api.rescanCollection(c.id)
    s().toast(r.added ? `Found ${r.added} new video${r.added === 1 ? '' : 's'}` : 'Already up to date', 'success')
  } catch (err) {
    s().toast((err as Error).message, 'error')
  }
}
