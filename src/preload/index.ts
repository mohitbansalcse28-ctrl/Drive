import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { Library, LuminaApi } from '@shared/types'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (v: T) => void): () => void {
  const listener = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: LuminaApi = {
  platform: process.platform,
  getLibrary: () => invoke('library:get'),
  onLibrary: (cb) => subscribe<Library>('library', cb),
  onOpenFiles: (cb) => subscribe<string[]>('open-files', cb),
  pickFolder: () => invoke('dialog:folder'),
  pickFiles: () => invoke('dialog:files'),
  importPaths: (paths, opts) => invoke('library:import', paths, opts),
  rescanCollection: (id) => invoke('library:rescan', id),
  createCollection: (input) => invoke('collection:create', input),
  updateCollection: (id, patch) => invoke('collection:update', id, patch),
  deleteCollection: (id) => invoke('collection:delete', id),
  reorderCollections: (ids) => invoke('collection:reorder', ids),
  addToCollection: (id, videoIds) => invoke('collection:add', id, videoIds),
  removeFromCollection: (id, videoIds) => invoke('collection:remove', id, videoIds),
  updateVideo: (id, patch) => invoke('video:update', id, patch),
  removeVideos: (ids) => invoke('video:remove', ids),
  saveProgress: (id, position, duration) => invoke('video:progress', id, position, duration),
  markPlayed: (id) => invoke('video:played', id),
  saveThumb: (payload) => invoke('thumbs:save', payload),
  resetThumbs: () => invoke('thumbs:reset'),
  cleanupMissing: () => invoke('library:cleanup'),
  updateSettings: (patch) => invoke('settings:update', patch),
  showInFolder: (id) => invoke('video:showInFolder', id),
  openExternal: (id) => invoke('video:openExternal', id),
  findSubtitle: (id) => invoke('subtitle:find', id),
  pickSubtitle: () => invoke('subtitle:pick'),
  saveSnapshot: (dataUrl, name) => invoke('snapshot:save', dataUrl, name),
  pathForFile: (file) => webUtils.getPathForFile(file),
  dataDir: () => invoke('app:dataDir'),
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close'),
    setFullScreen: (on) => ipcRenderer.send('win:fullscreen', on),
    isMaximized: () => invoke('win:isMaximized'),
    onMaximized: (cb) => subscribe<boolean>('win:maximized', cb)
  }
}

contextBridge.exposeInMainWorld('lumina', api)
