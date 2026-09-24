import { promises as fs } from 'node:fs'
import { extname, join } from 'node:path'
import { VIDEO_EXTENSIONS } from '@shared/types'

export interface FoundFile {
  path: string
  size: number
  mtime: number
}

const VIDEO_EXT = new Set<string>(VIDEO_EXTENSIONS)
const SKIP_DIRS = new Set(['$recycle.bin', 'system volume information', 'node_modules', '.git'])
const MAX_DEPTH = 12

export function isVideoFile(path: string): boolean {
  return VIDEO_EXT.has(extname(path).slice(1).toLowerCase())
}

/** Recursively collect video files below the given files/folders, sorted naturally. */
export async function scanPaths(paths: string[]): Promise<FoundFile[]> {
  const out: FoundFile[] = []
  const seen = new Set<string>()

  async function visit(p: string, depth: number): Promise<void> {
    const stat = await fs.stat(p).catch(() => null)
    if (!stat) return
    if (stat.isDirectory()) {
      if (depth > MAX_DEPTH) return
      const entries = await fs.readdir(p, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name.toLowerCase())) continue
        await visit(join(p, e.name), depth + 1)
      }
      return
    }
    if (stat.isFile() && isVideoFile(p) && !seen.has(p)) {
      seen.add(p)
      out.push({ path: p, size: stat.size, mtime: Math.round(stat.mtimeMs) })
    }
  }

  for (const p of paths) await visit(p, 0)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return out.sort((a, b) => collator.compare(a.path, b.path))
}
