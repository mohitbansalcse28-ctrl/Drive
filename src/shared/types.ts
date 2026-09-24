export const VIDEO_EXTENSIONS = [
  'mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'flv', 'ogv', 'ogg', '3gp', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg'
] as const

export const SUBTITLE_EXTENSIONS = ['srt', 'vtt'] as const

export type ThemeName = 'aurora' | 'sunset' | 'ocean' | 'emerald' | 'rose' | 'mono'

export type CollectionColor =
  | 'violet' | 'blue' | 'cyan' | 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate'

export type SortKey = 'name' | 'added' | 'duration' | 'size' | 'played'

export interface Video {
  id: string
  path: string
  name: string
  ext: string
  size: number
  mtime: number
  addedAt: number
  duration?: number
  width?: number
  height?: number
  /** Timestamp of the thumbnail on disk; undefined when not generated yet. */
  thumbAt?: number
  thumbFailed?: boolean
  missing?: boolean
  favorite: boolean
  rating: number
  tags: string[]
  playCount: number
  lastPlayedAt?: number
  /** Resume position, in seconds. */
  position: number
  watched: boolean
}

export interface Collection {
  id: string
  name: string
  description: string
  color: CollectionColor
  emoji: string
  coverVideoId?: string
  videoIds: string[]
  sourceFolder?: string
  pinned: boolean
  createdAt: number
  updatedAt: number
}

export interface Settings {
  theme: ThemeName
  cardSize: number
  autoplayNext: boolean
  resumePlayback: boolean
  ambientMode: boolean
  reduceMotion: boolean
  defaultVolume: number
  defaultSpeed: number
  seekStep: number
  thumbnailAt: number
}

export interface Library {
  version: number
  videos: Record<string, Video>
  collections: Collection[]
  settings: Settings
}

export interface ImportOptions {
  /** Create one collection per sub-folder that contains videos. */
  splitSubfolders: boolean
  /** Add the imported files to an existing collection instead of creating new ones. */
  targetCollectionId?: string
}

export interface ImportResult {
  added: number
  skipped: number
  collectionsCreated: number
  collectionIds: string[]
}

export interface ThumbPayload {
  videoId: string
  dataUrl?: string
  duration?: number
  width?: number
  height?: number
  failed?: boolean
}

export interface SubtitleFile {
  name: string
  vtt: string
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'aurora',
  cardSize: 240,
  autoplayNext: true,
  resumePlayback: true,
  ambientMode: true,
  reduceMotion: false,
  defaultVolume: 0.85,
  defaultSpeed: 1,
  seekStep: 10,
  thumbnailAt: 0.2
}

export const COLLECTION_COLORS: CollectionColor[] = [
  'violet', 'blue', 'cyan', 'emerald', 'lime', 'amber', 'orange', 'rose', 'pink', 'slate'
]

export type CollectionPatch = Partial<
  Pick<Collection, 'name' | 'description' | 'color' | 'emoji' | 'coverVideoId' | 'pinned'>
>

export type VideoPatch = Partial<Pick<Video, 'name' | 'favorite' | 'rating' | 'tags' | 'watched'>>

export interface LuminaApi {
  platform: string
  getLibrary(): Promise<Library>
  onLibrary(cb: (lib: Library) => void): () => void
  onOpenFiles(cb: (videoIds: string[]) => void): () => void
  pickFolder(): Promise<string | null>
  pickFiles(): Promise<string[]>
  importPaths(paths: string[], opts: ImportOptions): Promise<ImportResult>
  rescanCollection(id: string): Promise<ImportResult>
  createCollection(input: CollectionPatch & { name: string }): Promise<Collection>
  updateCollection(id: string, patch: CollectionPatch): Promise<void>
  deleteCollection(id: string): Promise<void>
  reorderCollections(ids: string[]): Promise<void>
  addToCollection(id: string, videoIds: string[]): Promise<void>
  removeFromCollection(id: string, videoIds: string[]): Promise<void>
  updateVideo(id: string, patch: VideoPatch): Promise<void>
  removeVideos(ids: string[]): Promise<void>
  saveProgress(id: string, position: number, duration: number): Promise<void>
  markPlayed(id: string): Promise<void>
  saveThumb(payload: ThumbPayload): Promise<void>
  resetThumbs(): Promise<void>
  cleanupMissing(): Promise<number>
  updateSettings(patch: Partial<Settings>): Promise<void>
  showInFolder(videoId: string): Promise<void>
  openExternal(videoId: string): Promise<void>
  findSubtitle(videoId: string): Promise<SubtitleFile | null>
  pickSubtitle(): Promise<SubtitleFile | null>
  saveSnapshot(dataUrl: string, suggestedName: string): Promise<string | null>
  pathForFile(file: File): string
  win: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    setFullScreen(on: boolean): void
    isMaximized(): Promise<boolean>
    onMaximized(cb: (max: boolean) => void): () => void
  }
  dataDir(): Promise<string>
}
