// Renders the Lumina icon + NSIS installer artwork with zero dependencies (PNG/ICO/BMP encoders inline).
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const A = [79, 88, 232] // indigo
const C = [112, 118, 250] // accent
const B = [146, 106, 240] // lavender

const lerp = (a, b, t) => a + (b - a) * t
const mix = (x, y, t) => x.map((v, i) => lerp(v, y[i], t))
const grad = (t) => (t < 0.55 ? mix(A, C, t / 0.55) : mix(C, B, (t - 0.55) / 0.45))

function roundedRectAlpha(x, y, s, r) {
  const cx = Math.min(Math.max(x, r), s - r)
  const cy = Math.min(Math.max(y, r), s - r)
  const d = Math.hypot(x - cx, y - cy)
  return d <= r ? 1 : 0
}

function inTriangle(px, py, [a, b, c]) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = sign([px, py], a, b)
  const d2 = sign([px, py], b, c)
  const d3 = sign([px, py], c, a)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

/** Returns RGBA buffer for the icon at `size`, 4x4 supersampled. */
function renderIcon(size) {
  const out = Buffer.alloc(size * size * 4)
  const ss = 4
  const pad = size * 0.03
  const s = size - pad * 2
  const r = s * 0.27
  const tri = [
    [pad + s * 0.39, pad + s * 0.28],
    [pad + s * 0.39, pad + s * 0.72],
    [pad + s * 0.75, pad + s * 0.5]
  ]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = [0, 0, 0, 0]
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss
          const py = y + (sy + 0.5) / ss
          const inside = roundedRectAlpha(px - pad, py - pad, s, r) && px >= pad && py >= pad && px <= pad + s && py <= pad + s
          if (!inside) continue
          const t = ((px - pad) / s + (py - pad) / s) / 2
          let col = grad(t)
          // soft top highlight + bottom shade
          const hy = (py - pad) / s
          col = mix(col, [255, 255, 255], Math.max(0, 0.14 - hy * 0.4))
          col = mix(col, [20, 10, 40], Math.max(0, (hy - 0.6) * 0.35))
          if (inTriangle(px, py, tri)) col = [255, 255, 255]
          acc = [acc[0] + col[0], acc[1] + col[1], acc[2] + col[2], acc[3] + 1]
        }
      }
      const n = ss * ss
      const i = (y * size + x) * 4
      const a = acc[3] / n
      out[i] = a ? acc[0] / acc[3] : 0
      out[i + 1] = a ? acc[1] / acc[3] : 0
      out[i + 2] = a ? acc[2] / acc[3] : 0
      out[i + 3] = Math.round(a * 255)
    }
  }
  return out
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(rgba, w, h) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}
function ico(sizes) {
  const images = sizes.map((s) => png(renderIcon(s), s, s))
  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(sizes.length, 4)
  const dir = Buffer.alloc(16 * sizes.length)
  let offset = 6 + dir.length
  sizes.forEach((s, i) => {
    dir[i * 16] = s >= 256 ? 0 : s
    dir[i * 16 + 1] = s >= 256 ? 0 : s
    dir.writeUInt16LE(1, i * 16 + 4)
    dir.writeUInt16LE(32, i * 16 + 6)
    dir.writeUInt32LE(images[i].length, i * 16 + 8)
    dir.writeUInt32LE(offset, i * 16 + 12)
    offset += images[i].length
  })
  return Buffer.concat([header, dir, ...images])
}

/** 24-bit bottom-up BMP, as NSIS requires for installer artwork. */
function bmp(w, h, pixel) {
  const row = Math.ceil((w * 3) / 4) * 4
  const buf = Buffer.alloc(54 + row * h)
  buf.write('BM')
  buf.writeUInt32LE(buf.length, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(w, 18)
  buf.writeInt32LE(h, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(row * h, 34)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y)
      const i = 54 + (h - 1 - y) * row + x * 3
      buf[i] = b
      buf[i + 1] = g
      buf[i + 2] = r
    }
  }
  return buf
}

function sidebar(w, h) {
  const logoSize = 84
  const logo = renderIcon(logoSize)
  const lx = Math.round((w - logoSize) / 2)
  const ly = 70
  return bmp(w, h, (x, y) => {
    const t = y / h
    let col = mix([16, 17, 26], [9, 10, 14], t)
    // aurora glows
    const g1 = Math.exp(-(((x - w * 0.2) / 90) ** 2 + ((y - h * 0.15) / 110) ** 2))
    const g2 = Math.exp(-(((x - w * 0.9) / 80) ** 2 + ((y - h * 0.75) / 120) ** 2))
    col = mix(col, A, g1 * 0.45)
    col = mix(col, B, g2 * 0.25)
    if (x >= lx && x < lx + logoSize && y >= ly && y < ly + logoSize) {
      const i = ((y - ly) * logoSize + (x - lx)) * 4
      col = mix(col, [logo[i], logo[i + 1], logo[i + 2]], logo[i + 3] / 255)
    }
    return col.map((v) => Math.round(Math.min(255, v)))
  })
}

mkdirSync('build', { recursive: true })
mkdirSync('resources', { recursive: true })
writeFileSync('build/icon.ico', ico([16, 24, 32, 48, 64, 128, 256]))
writeFileSync('build/icon.png', png(renderIcon(512), 512, 512))
writeFileSync('resources/icon.png', png(renderIcon(256), 256, 256))
writeFileSync('build/installerSidebar.bmp', sidebar(164, 314))
writeFileSync('build/uninstallerSidebar.bmp', sidebar(164, 314))
console.log('icons written')
