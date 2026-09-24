/** Convert SubRip (.srt) text to WebVTT so it can be used by a <track> element. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
    .split('\n\n')
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n')
      // Drop numeric cue identifiers, keep timing + text.
      if (/^\d+$/.test(lines[0]) && lines[1]?.includes('-->')) lines.shift()
      return lines.join('\n')
    })
    .join('\n\n')
  return `WEBVTT\n\n${body}\n`
}

export function toVtt(text: string, ext: string): string {
  if (ext.toLowerCase() === 'vtt') return text.replace(/^﻿/, '')
  return srtToVtt(text)
}
