// Measures how fast large/long videos open: double-click → first decoded frame on screen.
// Covers a fresh open, a resume deep into the file, and a seek on an open video.
//
//   APP_DIR=<project> BIG_DIR=<folder with big files> xvfb-run -a node tests/e2e/open-speed.mjs
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const here = dirname(fileURLToPath(import.meta.url))
const appDir = process.env.APP_DIR || join(here, '../..')
const bigDir = process.env.BIG_DIR || join(here, '.tmp/big')
const userData = join(here, `.tmp/open-ud-${Date.now()}`)

const app = await electron.launch({
  args: [join(appDir, 'out/main/index.js'), '--no-sandbox'],
  env: { ...process.env, LUMINA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
})
const page = await app.firstWindow()
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
await page.getByTestId('nav-home').waitFor()
await page.evaluate((p) => window.lumina.importPaths([p], { splitSubfolders: false }), bigDir)
// Let thumbnails finish so they don't skew the timings.
for (let i = 0; i < 120; i++) {
  const done = await page.evaluate(async () => Object.values((await window.lumina.getLibrary()).videos).every((v) => v.thumbAt || v.thumbFailed))
  if (done) break
  await page.waitForTimeout(500)
}
await page.getByTestId('nav-all').click()

/** Double-click a card and time until a frame is presented at/after `minTime`. */
async function openAndTime(name, minTime = 0) {
  await page.getByTestId('video-card').filter({ hasText: name }).first().hover()
  const start = await page.evaluate(() => performance.now())
  await page.getByTestId('video-card').filter({ hasText: name }).first().dblclick()
  const ms = await page.evaluate(async ({ start, minTime }) => {
    let v
    while (!(v = document.querySelector('.player-video'))) await new Promise((r) => setTimeout(r, 2))
    await new Promise((resolve) => {
      const check = () =>
        v.requestVideoFrameCallback((_now, meta) => (meta.mediaTime >= minTime - 0.5 ? resolve() : check()))
      check()
    })
    return performance.now() - start
  }, { start, minTime })
  return Math.round(ms)
}

/** Seek the way a user does (number key 7 → 70%), immediately after the first frame. */
async function seekTime() {
  const start = await page.evaluate(() => performance.now())
  await page.keyboard.press('7')
  return page.evaluate(async (start) => {
    const v = document.querySelector('.player-video')
    const to = v.duration * 0.7
    await new Promise((resolve) => {
      const check = () => v.requestVideoFrameCallback((_n, m) => (Math.abs(m.mediaTime - to) < 1 ? resolve() : check()))
      check()
    })
    return Math.round(performance.now() - start)
  }, start)
}

const closePlayer = async () => {
  await page.getByTestId('player-close').click()
  await page.getByTestId('player').waitFor({ state: 'detached' })
}

const results = {}
for (const [label, name] of [['mp4 (index at end, 1.5 GB, 20 min)', 'big-moov-end'], ['mkv (1.5 GB, 20 min)', 'big']]) {
  results[`${label} · open`] = await openAndTime(name)
  results[`${label} · seek to 14:00 (key 7)`] = await seekTime()
  await closePlayer()
  // Re-open: should resume near 14:00.
  results[`${label} · resume`] = await openAndTime(name, 830)
  await closePlayer()
}
const mem = await app.evaluate(() => Math.round(process.memoryUsage().rss / 1e6))
console.log(JSON.stringify({ ...results, mainRssMB: mem }, null, 1))
await app.close()
rmSync(userData, { recursive: true, force: true })
