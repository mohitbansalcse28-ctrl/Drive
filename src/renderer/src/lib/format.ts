import type { CollectionColor, ThemeName } from '@shared/types'

export function formatDuration(sec?: number): string {
  if (sec === undefined || !Number.isFinite(sec) || sec < 0) return '--:--'
  const s = Math.floor(sec % 60)
  const m = Math.floor((sec / 60) % 60)
  const h = Math.floor(sec / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatLongDuration(sec: number): string {
  if (!sec) return '0m'
  if (sec < 60) return `${Math.round(sec)}s`
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / 1024 ** i).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
}

export function timeAgo(ts?: number): string {
  if (!ts) return 'Never'
  const diff = (Date.now() - ts) / 1000
  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`
  return new Date(ts).toLocaleDateString()
}

/** Quality label from the short side, so a 1080×1920 vertical video reads "1080p". */
export function resolutionLabel(height?: number, width?: number): string | null {
  const h = height && width ? Math.min(height, width) : height
  if (!h) return null
  if (h >= 2100) return '4K'
  if (h >= 1400) return '1440p'
  if (h >= 1000) return '1080p'
  if (h >= 700) return '720p'
  return `${h}p`
}

/** [primary, deep, light] — muted, harmonious tones that sit well on the dark UI. */
export const COLLECTION_GRADIENTS: Record<CollectionColor, [string, string, string]> = {
  violet: ['#9384f7', '#5a49c2', '#cfc6ff'],
  blue: ['#6395f2', '#2f5fbf', '#bcd2ff'],
  cyan: ['#3cc2d6', '#157c8f', '#b0eef7'],
  emerald: ['#3fc795', '#17805c', '#b2f0d6'],
  lime: ['#a3c95a', '#5f8422', '#e0f0b4'],
  amber: ['#ebb04a', '#a86c14', '#fbe3ad'],
  orange: ['#f08756', '#b24b1f', '#ffcdb4'],
  rose: ['#ea6b83', '#a8304b', '#ffc6d0'],
  pink: ['#dc7bbf', '#9c3b82', '#f8cbea'],
  slate: ['#94a0b4', '#505a6d', '#d9dfe9']
}

/** Each theme is a single accent (+ an analogous partner for subtle gradients) and the text colour used on it. */
export const THEMES: Record<ThemeName, { label: string; accent: string; accent2: string; on: string }> = {
  aurora: { label: 'Indigo', accent: '#8b97ff', accent2: '#b69cff', on: '#0c0f24' },
  sunset: { label: 'Sunset', accent: '#ff9061', accent2: '#ffc15e', on: '#241006' },
  ocean: { label: 'Ocean', accent: '#4cc3f7', accent2: '#6fe0e8', on: '#04151f' },
  emerald: { label: 'Emerald', accent: '#43d3a0', accent2: '#a6e36a', on: '#04170f' },
  rose: { label: 'Rosé', accent: '#f47fb7', accent2: '#c79bff', on: '#240616' },
  mono: { label: 'Graphite', accent: '#e4e7ee', accent2: '#aab2c2', on: '#0d0f14' }
}

export const thumbUrl = (id: string, at?: number) => (at ? `lumina://thumb/${id}?v=${at}` : undefined)
export const videoUrl = (id: string) => `lumina://video/${id}`
