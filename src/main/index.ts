import { promises as fs, existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  protocol,
  shell,
  type IpcMainInvokeEvent
} from 'electron'
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, type ThumbPayload } from '@shared/types'
import { LibraryStore } from './library'
import { serveFile } from './media-protocol'
import { isVideoFile } from './scanner'
import { toVtt } from './subtitles'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'lumina',
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  }
])

// Allow tests / portable setups to redirect where the library lives.
if (process.env.LUMINA_USER_DATA) app.setPath('userData', process.env.LUMINA_USER_DATA)
app.setAppUserModelId('com.lumina.videovault')

// Smoother scrolling/animation: rasterize on the GPU and avoid extra texture copies.
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

const store = new LibraryStore(join(app.getPath('userData'), 'library.json'))
let win: BrowserWindow | null = null
let pendingOpen: string[] = []

function filesFromArgv(argv: string[]): string[] {
  return argv.slice(1).filter((a) => !a.startsWith('-') && isVideoFile(a) && existsSync(a))
}

async function openFiles(paths: string[]): Promise<void> {
  if (!paths.length) return
  const ids = await store.registerFiles(paths)
  if (win && !win.webContents.isLoading()) win.webContents.send('open-files', ids)
  else pendingOpen.push(...paths)
}

function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(__dirname, '../../resources/icon.png')
}

function createWindow(): void {
  const isWin = process.platform === 'win32'
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    show: false,
    frame: false,
    backgroundColor: '#07070c',
    icon: nativeImage.createFromPath(iconPath()),
    titleBarStyle: isWin ? 'hidden' : undefined,
    titleBarOverlay: isWin ? { color: '#00000000', symbolColor: '#e8e8f5', height: 44 } : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })

  win.once('ready-to-show', () => win?.show())
  win.on('maximize', () => win?.webContents.send('win:maximized', true))
  win.on('unmaximize', () => win?.webContents.send('win:maximized', false))
  win.on('closed', () => (win = null))
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('did-finish-load', () => {
    if (pendingOpen.length) {
      const paths = pendingOpen
      pendingOpen = []
      void openFiles(paths)
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function handle<A extends unknown[], R>(
  channel: string,
  fn: (...args: A) => R | Promise<R>
): void {
  ipcMain.handle(channel, (_e: IpcMainInvokeEvent, ...args: unknown[]) => fn(...(args as A)))
}

async function readSubtitle(path: string) {
  const text = await fs.readFile(path, 'utf8')
  return { name: basename(path), vtt: toVtt(text, extname(path).slice(1)) }
}

function registerIpc(): void {
  handle('library:get', () => store.lib)
  handle('dialog:folder', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Import a folder of videos',
      properties: ['openDirectory', 'multiSelections']
    })
    return r.canceled ? null : r.filePaths[0] ?? null
  })
  handle('dialog:files', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Add videos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Videos', extensions: [...VIDEO_EXTENSIONS] }]
    })
    return r.canceled ? [] : r.filePaths
  })
  handle('library:import', store.importPaths.bind(store))
  handle('library:rescan', store.rescanCollection.bind(store))
  handle('collection:create', store.createCollection.bind(store))
  handle('collection:update', store.updateCollection.bind(store))
  handle('collection:delete', store.deleteCollection.bind(store))
  handle('collection:reorder', store.reorderCollections.bind(store))
  handle('collection:add', store.addToCollection.bind(store))
  handle('collection:remove', store.removeFromCollection.bind(store))
  handle('video:update', store.updateVideo.bind(store))
  handle('video:remove', store.removeVideos.bind(store))
  handle('video:progress', store.saveProgress.bind(store))
  handle('video:played', store.markPlayed.bind(store))
  handle('thumbs:reset', store.resetThumbs.bind(store))
  handle('library:cleanup', store.cleanupMissing.bind(store))
  handle('settings:update', store.updateSettings.bind(store))
  handle('app:dataDir', () => app.getPath('userData'))

  handle('thumbs:save', async (p: ThumbPayload) => {
    const jpeg = p.dataUrl ? Buffer.from(p.dataUrl.split(',')[1] ?? '', 'base64') : undefined
    await store.saveThumb({ ...p, jpeg: jpeg?.length ? jpeg : undefined })
  })

  handle('video:showInFolder', (id: string) => {
    const v = store.lib.videos[id]
    if (v) shell.showItemInFolder(v.path)
  })
  handle('video:openExternal', async (id: string) => {
    const v = store.lib.videos[id]
    if (v) await shell.openPath(v.path)
  })

  handle('subtitle:find', async (id: string) => {
    const v = store.lib.videos[id]
    if (!v) return null
    const dir = dirname(v.path)
    const stem = basename(v.path, extname(v.path)).toLowerCase()
    const entries = await fs.readdir(dir).catch(() => [] as string[])
    const match = entries.find((f) => {
      const ext = extname(f).slice(1).toLowerCase()
      return (SUBTITLE_EXTENSIONS as readonly string[]).includes(ext) && f.toLowerCase().startsWith(stem)
    })
    return match ? readSubtitle(join(dir, match)) : null
  })
  handle('subtitle:pick', async () => {
    const r = await dialog.showOpenDialog(win!, {
      title: 'Load subtitles',
      properties: ['openFile'],
      filters: [{ name: 'Subtitles', extensions: [...SUBTITLE_EXTENSIONS] }]
    })
    return r.canceled || !r.filePaths[0] ? null : readSubtitle(r.filePaths[0])
  })

  handle('snapshot:save', async (dataUrl: string, name: string) => {
    const dir = join(app.getPath('pictures'), 'Lumina')
    await fs.mkdir(dir, { recursive: true })
    const safe = name.replace(/[<>:"/\\|?*]+/g, '_').slice(0, 120)
    const file = join(dir, `${safe}.png`)
    await fs.writeFile(file, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'))
    return file
  })

  ipcMain.on('win:minimize', () => win?.minimize())
  ipcMain.on('win:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()))
  ipcMain.on('win:close', () => win?.close())
  ipcMain.on('win:fullscreen', (_e, on: boolean) => win?.setFullScreen(on))
  handle('win:isMaximized', () => win?.isMaximized() ?? false)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    void openFiles(filesFromArgv(argv))
  })

  app.whenReady().then(async () => {
    await store.load()
    store.onChange((lib) => win?.webContents.send('library', lib))

    protocol.handle('lumina', (req) => {
      const url = new URL(req.url)
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
      if (url.host === 'video') {
        const v = store.lib.videos[id]
        if (!v) return new Response('Unknown video', { status: 404 })
        return serveFile(v.path, req.headers.get('range'))
      }
      if (url.host === 'thumb') return serveFile(store.thumbPath(id), null)
      return new Response('Bad request', { status: 400 })
    })

    registerIpc()
    pendingOpen = filesFromArgv(process.argv)
    if (pendingOpen.length) await store.registerFiles(pendingOpen)
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  let flushed = false
  app.on('before-quit', (e) => {
    if (flushed) return
    e.preventDefault()
    flushed = true
    void store.flush().finally(() => app.quit())
  })
}
