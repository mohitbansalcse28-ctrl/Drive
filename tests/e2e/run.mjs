// End-to-end test: launches the built Electron app against a throwaway library and
// real generated videos, drives the UI and captures screenshots of every screen.
//
//   npm run build && FFMPEG=/path/to/ffmpeg xvfb-run -a npm run test:e2e
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const tmp = join(root, 'tests/e2e/.tmp')
const media = join(tmp, 'media')
const userData = join(tmp, 'userdata')
const shots = join(root, 'tests/e2e/screenshots')
const ffmpeg = process.env.FFMPEG || 'ffmpeg'

let failures = 0
let passes = 0
async function step(name, fn) {
  try {
    await fn()
    passes++
    console.log(`  ✓ ${name}`)
  } catch (err) {
    failures++
    console.log(`  ✗ ${name}\n      ${String(err?.stack || err).split('\n').slice(0, 4).join('\n      ')}`)
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, msg, timeout = 20000) {
  const start = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${msg}`)
    await sleep(200)
  }
}

function makeVideo(file, { seconds = 12, pattern = 'testsrc2', size = '1280x720', hue = 0, codec = 'h264' }) {
  if (existsSync(file)) return
  mkdirSync(dirname(file), { recursive: true })
  const v = `${pattern}=size=${size}:rate=30,hue=h=${hue},format=yuv420p`
  const a = `sine=frequency=${300 + hue}:duration=${seconds}`
  const enc =
    codec === 'vp9'
      ? ['-c:v', 'libvpx-vp9', '-b:v', '600k', '-deadline', 'realtime', '-c:a', 'libopus']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', v, '-f', 'lavfi', '-i', a, '-t', String(seconds), ...enc, file])
}

console.log('Preparing fixtures…')
rmSync(userData, { recursive: true, force: true })
mkdirSync(shots, { recursive: true })
makeVideo(join(media, 'Travel/Paris at night.mp4'), { hue: 0 })
makeVideo(join(media, 'Travel/Tokyo_streets.webm'), { hue: 120, codec: 'vp9', pattern: 'mandelbrot' })
makeVideo(join(media, 'Travel/Beach/Golden sunset.mp4'), { hue: 200, pattern: 'life', size: '1920x1080' })
makeVideo(join(media, 'Tutorials/Lesson 01 - Intro.mp4'), { hue: 60, seconds: 20 })
makeVideo(join(media, 'Tutorials/Lesson 02 - Setup.mp4'), { hue: 300, pattern: 'smptehdbars' })
makeVideo(join(media, 'Tutorials/Lesson 03 - Advanced.mp4'), { hue: 250, pattern: 'rgbtestsrc' })
writeFileSync(
  join(media, 'Tutorials/Lesson 01 - Intro.srt'),
  '1\n00:00:00,000 --> 00:00:10,000\nWelcome to Lumina subtitles!\n'
)
writeFileSync(join(media, 'Tutorials/corrupt.mp4'), Buffer.alloc(4096, 7))

console.log('Launching Lumina…')
const app = await electron.launch({
  args: [join(root, 'out/main/index.js'), '--no-sandbox'],
  env: { ...process.env, LUMINA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' },
  timeout: 60000
})
const page = await app.firstWindow()
const consoleErrors = []
page.on('pageerror', (e) => consoleErrors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()))
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900))
const shot = (name) => page.screenshot({ path: join(shots, `${name}.png`) })
const lib = () => page.evaluate(() => window.lumina.getLibrary())

console.log('Running scenarios:')

await step('shows the welcome screen on an empty library', async () => {
  await page.getByText('Welcome to Lumina').waitFor({ timeout: 15000 })
  await sleep(900)
  await shot('01-welcome')
})

await step('imports folders, splitting sub-folders into collections', async () => {
  const r = await page.evaluate((p) => window.lumina.importPaths([p], { splitSubfolders: true }), media)
  assert(r.added === 7, `expected 7 added, got ${r.added}`)
  assert(r.collectionsCreated === 3, `expected 3 collections, got ${r.collectionsCreated}`)
  const l = await lib()
  const names = l.collections.map((c) => c.name).sort()
  assert(JSON.stringify(names) === JSON.stringify(['Travel', 'Travel › Beach', 'Tutorials']), `names: ${names}`)
})

await step('generates thumbnails + metadata in the background', async () => {
  await waitFor(async () => {
    const l = await lib()
    return Object.values(l.videos).every((v) => v.thumbAt || v.thumbFailed)
  }, 'thumbnails', 60000)
  const l = await lib()
  const vids = Object.values(l.videos)
  const bad = vids.filter((v) => v.thumbFailed).map((v) => v.name)
  assert(bad.length === 1 && bad[0] === 'corrupt', `failed thumbs: ${bad}`)
  const paris = vids.find((v) => v.name === 'Paris at night')
  assert(Math.abs(paris.duration - 12) < 0.5, `duration ${paris.duration}`)
  assert(paris.width === 1280 && paris.height === 720, `size ${paris.width}x${paris.height}`)
  const sunset = vids.find((v) => v.name === 'Golden sunset')
  assert(sunset.height === 1080, 'sunset 1080p')
  assert(existsSync(join(userData, 'thumbs', `${paris.id}.jpg`)), 'thumb file on disk')
})

await step('home dashboard renders hero, stats and folder cards', async () => {
  await page.getByTestId('nav-home').click()
  await page.getByTestId('hero-play').waitFor()
  await waitFor(async () => (await page.getByTestId('folder-card').count()) === 3, 'folder cards on home')
  await sleep(1200)
  await shot('02-home')
})

await step('collections grid shows folder cards with hover animation', async () => {
  await page.getByTestId('nav-collections').click()
  await waitFor(async () => (await page.getByTestId('folder-card').count()) === 3, '3 folder cards')
  await sleep(800)
  const card = page.getByTestId('folder-card').first()
  const box = await card.boundingBox()
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4)
  await sleep(700)
  await shot('03-collections')
})

await step('protocol serves byte ranges to the renderer', async () => {
  const l = await lib()
  const id = Object.values(l.videos).find((v) => v.name === 'Paris at night').id
  const r = await page.evaluate(async (id) => {
    const res = await fetch(`lumina://video/${id}`, { headers: { Range: 'bytes=0-99' } })
    return { status: res.status, len: (await res.arrayBuffer()).byteLength, range: res.headers.get('content-range') }
  }, id)
  assert(r.status === 206 && r.len === 100 && r.range.startsWith('bytes 0-99/'), JSON.stringify(r))
})

await step('opens a collection with banner and video grid', async () => {
  await page.getByTestId('folder-card').filter({ hasText: 'Tutorials' }).click()
  await page.getByTestId('collection-title').filter({ hasText: 'Tutorials' }).waitFor()
  await waitFor(async () => (await page.getByTestId('video-card').count()) === 4, '4 video cards')
  await sleep(900)
  await shot('04-collection')
})

await step('filter narrows the grid, list view renders rows', async () => {
  await page.getByTestId('filter-input').fill('lesson 02')
  await waitFor(async () => (await page.getByTestId('video-card').count()) === 1, 'filtered to 1')
  await page.getByTestId('filter-input').fill('')
  await page.getByTestId('view-list').click()
  await waitFor(async () => (await page.getByTestId('video-row').count()) === 4, '4 rows')
  await sleep(400)
  await shot('05-list-view')
  await page.locator('.segmented.icons button').first().click()
})

await step('context menu offers video actions', async () => {
  const card = page.getByTestId('video-card').filter({ hasText: 'Lesson 02' })
  await card.click({ button: 'right' })
  await page.locator('.menu').waitFor()
  await page.locator('.menu-item', { hasText: 'Add to collection' }).hover()
  await page.locator('.menu-item', { hasText: 'New collection…' }).waitFor()
  const menus = await page.locator('.menu').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
  assert(menus.length === 2, `submenu open (${menus.length} menus)`)
  for (const r of menus) assert(r.bottom <= 900 && r.right <= 1440 && r.left >= 0, `menu inside window ${JSON.stringify(r)}`)
  await sleep(300)
  await shot('06-context-menu')
  await page.locator('.menu-item', { hasText: 'Favorite' }).first().click()
  await waitFor(async () => Object.values((await lib()).videos).find((v) => v.name.includes('Lesson 02')).favorite, 'favorite set')
})

await step('plays a video with subtitles, seeking and keyboard control', async () => {
  await page.getByTestId('video-card').filter({ hasText: 'Lesson 01' }).dblclick()
  await page.getByTestId('player').waitFor()
  await waitFor(() => page.evaluate(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1), 'playback advances', 15000)
  const trackCount = await page.evaluate(() => document.querySelector('.player-video').textTracks.length)
  assert(trackCount === 1, `sidecar subtitle track loaded (${trackCount})`)
  await page.locator('.subtitles', { hasText: 'Welcome to Lumina subtitles!' }).waitFor({ timeout: 5000 })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press(']')
  const state = await page.evaluate(() => {
    const v = document.querySelector('.player-video')
    return { t: v.currentTime, rate: v.playbackRate, paused: v.paused }
  })
  assert(state.rate === 1.25, `rate ${state.rate}`)
  assert(state.t > 5, `seeked to ${state.t}`)
  await page.mouse.move(700, 450)
  const bar = await page.getByTestId('seekbar').boundingBox()
  await page.mouse.move(bar.x + bar.width * 0.6, bar.y + bar.height / 2)
  await sleep(900)
  await shot('07-player')
  await page.keyboard.press('k')
  await waitFor(() => page.evaluate(() => document.querySelector('.player-video').paused), 'paused with K')
})

await step('queue panel lists the collection', async () => {
  await page.locator('.p-btn[title="Up next"]').click()
  await page.locator('.queue-item').first().waitFor()
  assert((await page.locator('.queue-item').count()) === 4, 'queue has all 4 collection videos')
})

await step('next video advances the queue', async () => {
  await page.keyboard.press('Escape') // closes panel
  await page.keyboard.press('n')
  await waitFor(() => page.locator('.player-title h2', { hasText: 'Lesson 02' }).count(), 'advanced to lesson 02')
})

await step('closing the player saves resume position', async () => {
  await waitFor(() => page.evaluate(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 2), 'lesson 02 plays', 15000)
  await page.getByTestId('player-close').click()
  await waitFor(async () => {
    const v = Object.values((await lib()).videos).find((x) => x.name.includes('Lesson 02'))
    return v.position > 1 && v.playCount === 1
  }, 'position saved')
  const l1 = Object.values((await lib()).videos).find((x) => x.name.includes('Lesson 01'))
  assert(l1.playCount === 1 && l1.lastPlayedAt, 'lesson 1 play recorded')
})

await step('corrupt file shows a graceful error', async () => {
  await page.getByTestId('filter-input').fill('corrupt')
  await sleep(700) // let the filtered grid finish its entrance animation
  const card = page.getByTestId('video-card').first()
  await card.hover()
  await card.locator('.video-play').click()
  await page.locator('.player-error').waitFor({ timeout: 15000 })
  await shot('08-player-error')
  await page.keyboard.press('Escape')
  await page.getByTestId('player').waitFor({ state: 'detached' })
  await page.getByTestId('filter-input').fill('')
})

await step('creates a collection through the editor', async () => {
  await page.getByTestId('new-collection').click()
  await page.getByTestId('collection-name').fill('Weekend picks')
  await page.locator('.emoji-grid button', { hasText: '🍿' }).click()
  await page.locator('.swatch[title="amber"]').click()
  await sleep(300)
  await shot('09-collection-editor')
  await page.getByTestId('collection-save').click()
  await page.getByTestId('collection-title').filter({ hasText: 'Weekend picks' }).waitFor()
  const c = (await lib()).collections.find((x) => x.name === 'Weekend picks')
  assert(c && c.emoji === '🍿' && c.color === 'amber', JSON.stringify(c))
})

await step('continue-watching hero appears on home', async () => {
  await page.getByTestId('nav-home').click()
  await page.getByText('Continue watching').first().waitFor()
  await sleep(900)
  await shot('10-home-continue')
})

await step('command palette searches the library', async () => {
  await page.keyboard.press('Control+k')
  await page.getByTestId('palette-input').fill('tokyo')
  await page.locator('.palette-item', { hasText: 'Tokyo streets' }).waitFor()
  await sleep(300)
  await shot('11-palette')
  await page.keyboard.press('Escape')
})

await step('favorites view lists favorited videos', async () => {
  await page.getByTestId('nav-favorites').click()
  await waitFor(async () => (await page.getByTestId('video-card').count()) === 1, '1 favorite')
})

await step('settings change the theme and persist', async () => {
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('theme-sunset').click()
  await waitFor(async () => (await lib()).settings.theme === 'sunset', 'theme saved')
  await sleep(600)
  await shot('12-settings')
  await page.getByTestId('nav-collections').click()
  await sleep(1000)
  await shot('13-collections-sunset')
  await page.getByTestId('nav-settings').click()
  await page.getByTestId('theme-aurora').click()
})

await step('library is flushed to disk', async () => {
  await sleep(800)
  const saved = JSON.parse(readFileSync(join(userData, 'library.json'), 'utf8'))
  assert(saved.collections.length === 4, `saved collections ${saved.collections.length}`)
  assert(Object.keys(saved.videos).length === 7, 'saved videos')
})

await step('no uncaught renderer errors', async () => {
  const real = consoleErrors.filter((e) => !/corrupt|MEDIA_ERR|Format error|DEMUXER|NotSupportedError|net::ERR/i.test(e))
  assert(!real.length, real.join('\n'))
})

await app.close()
console.log(`\n${passes} passed, ${failures} failed`)
process.exit(failures ? 1 : 0)
