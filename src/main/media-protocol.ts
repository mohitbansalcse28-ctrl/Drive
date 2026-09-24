import { createReadStream, promises as fs } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'

const MIME: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'video/webm', mov: 'video/quicktime',
  avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', flv: 'video/x-flv', ogv: 'video/ogg', ogg: 'video/ogg',
  '3gp': 'video/3gpp', ts: 'video/mp2t', mts: 'video/mp2t', m2ts: 'video/mp2t', mpg: 'video/mpeg',
  mpeg: 'video/mpeg', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png'
}

export function mimeFor(path: string): string {
  return MIME[extname(path).slice(1).toLowerCase()] ?? 'application/octet-stream'
}

/** Parse a single-range `Range` header. Returns null when absent or unsatisfiable. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  let start: number
  let end: number
  if (m[1] === '') {
    const suffix = Number(m[2])
    if (!suffix) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(m[1])
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1)
  }
  if (start > end || start >= size) return null
  return { start, end }
}

/** Serve a local file as a (possibly partial) HTTP response so <video> can seek. */
export async function serveFile(path: string, rangeHeader: string | null): Promise<Response> {
  const stat = await fs.stat(path).catch(() => null)
  if (!stat || !stat.isFile()) return new Response('Not found', { status: 404 })
  const size = stat.size
  const type = mimeFor(path)
  const range = parseRange(rangeHeader, size)
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
  }
  const { start, end } = range ?? { start: 0, end: size - 1 }
  const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream
  const headers = {
    'Content-Type': type,
    'Content-Length': String(end - start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*'
  }
  if (!range) return new Response(stream, { status: 200, headers })
  return new Response(stream, {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` }
  })
}
