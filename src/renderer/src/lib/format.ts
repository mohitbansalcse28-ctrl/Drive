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

export function resolutionLabel(h?: number): string | null {
  if (!h) return null
  if (h >= 2100) return '4K'
  if (h >= 1400) return '1440p'
  if (h >= 1000) return '1080p'
  if (h >= 700) return '720p'
  return `${h}p`
}

export const COLLECTION_GRADIENTS: Record<CollectionColor, [string, string, string]> = {
  violet: ['#8b5cf6', '#6d28d9', '#c4b5fd'],
  blue: ['#3b82f6', '#1d4ed8', '#93c5fd'],
  cyan: ['#06b6d4', '#0e7490', '#67e8f9'],
  emerald: ['#10b981', '#047857', '#6ee7b7'],
  lime: ['#84cc16', '#4d7c0f', '#bef264'],
  amber: ['#f59e0b', '#b45309', '#fcd34d'],
  orange: ['#f97316', '#c2410c', '#fdba74'],
  rose: ['#f43f5e', '#be123c', '#fda4af'],
  pink: ['#ec4899', '#be185d', '#f9a8d4'],
  slate: ['#64748b', '#334155', '#cbd5e1']
}

export const THEMES: Record<ThemeName, { label: string; a: string; b: string; c: string }> = {
  aurora: { label: 'Aurora', a: '#8b5cf6', b: '#22d3ee', c: '#f472b6' },
  sunset: { label: 'Sunset', a: '#f97316', b: '#f43f5e', c: '#facc15' },
  ocean: { label: 'Ocean', a: '#3b82f6', b: '#06b6d4', c: '#818cf8' },
  emerald: { label: 'Emerald', a: '#10b981', b: '#84cc16', c: '#22d3ee' },
  rose: { label: 'Rosé', a: '#ec4899', b: '#a855f7', c: '#fb7185' },
  mono: { label: 'Graphite', a: '#e5e7eb', b: '#9ca3af', c: '#f5f5f5' }
}

export const thumbUrl = (id: string, at?: number) => (at ? `lumina://thumb/${id}?v=${at}` : undefined)
export const videoUrl = (id: string) => `lumina://video/${id}`
