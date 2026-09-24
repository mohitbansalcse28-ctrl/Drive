// Stress benchmark: 800-video library. Measures import time, time to render the "All videos"
// grid, navigation latency and scroll smoothness (frame times) while thumbnails generate.
//
//   APP_DIR=<project root to test> FFMPEG=... xvfb-run -a node tests/e2e/perf.mjs
import { execFileSync } from 'node:child_process'
import { existsSync, linkSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = process.env.APP_DIR || join(here, '../..')
const tmp = join(here, '.tmp/perf')
const media = join(tmp, 'media')
const userData = join(tmp, `userdata-${Date.now()}`)
const COUNT = 800

if (!existsSync(join(media, `clip-${COUNT - 1}.mp4`))) {
  mkdirSync(media, { recursive: true })
  const src = join(tmp, 'src.mp4')
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-t', '6',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', src])
  for (let i = 0; i < COUNT; i++) {
    const f = join(media, `clip-${i}.mp4`)
    if (!existsSync(f)) linkSync(src, f)
  }
}

const app = await electron.launch({
  args: [join(appDir, 'out/main/index.js'), '--no-sandbox'],
  env: { ...process.env, LUMINA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
})
const page = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
await page.getByTestId('nav-home').waitFor()

const t0 = Date.now()
await page.evaluate((p) => window.lumina.importPaths([p], { splitSubfolders: false }), media)
const importMs = Date.now() - t0

// Time from click to all cards being in the DOM and painted.
const renderMs = await page.evaluate(async () => {
  const start = performance.now()
  document.querySelector('[data-testid="nav-all"]').click()
  while (document.querySelectorAll('[data-testid="video-card"]').length < 800) await new Promise((r) => setTimeout(r, 5))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return performance.now() - start
})

// Navigation latency: switch views back and forth.
const navMs = await page.evaluate(async () => {
  const times = []
  for (const id of ['nav-collections', 'nav-all', 'nav-home', 'nav-all']) {
    const s = performance.now()
    document.querySelector(`[data-testid="${id}"]`).click()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    times.push(performance.now() - s)
  }
  return times.reduce((a, b) => a + b, 0) / times.length
})

// Scroll the grid for ~3s while thumbnails are generating, recording frame times.
const measureScroll = () => page.evaluate(async () => {
  const el = document.querySelector('.content')
  const deltas = []
  let last = performance.now()
  const end = last + 3000
  await new Promise((resolve) => {
    const tick = (now) => {
      deltas.push(now - last)
      last = now
      el.scrollTop += 40
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) el.scrollTop = 0
      if (now < end) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  deltas.sort((a, b) => a - b)
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length
  return {
    fps: Math.round(1000 / avg),
    p95: +deltas[Math.floor(deltas.length * 0.95)].toFixed(1),
    jank: deltas.filter((d) => d > 50).length
  }
})

const frames = await measureScroll()
let idle = null
if (process.env.IDLE) {
  // Wait for every thumbnail, then measure scrolling with no background work.
  const until = Date.now() + 240000
  while (Date.now() < until) {
    const n = await page.evaluate(async () => Object.values((await window.lumina.getLibrary()).videos).filter((v) => v.thumbAt).length)
    if (n >= 800) break
    await new Promise((r) => setTimeout(r, 1000))
  }
  idle = await measureScroll()
}
const thumbs = await page.evaluate(async () => Object.values((await window.lumina.getLibrary()).videos).filter((v) => v.thumbAt).length)
console.log(JSON.stringify({ importMs, renderMs: Math.round(renderMs), navMs: Math.round(navMs), ...frames, thumbsDone: thumbs, idle }))
await app.close()
rmSync(userData, { recursive: true, force: true })
