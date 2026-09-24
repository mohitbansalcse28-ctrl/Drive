// Drives the real app over the demo library and captures every README screenshot + a demo animation.
//   npm run build && xvfb-run -a -s "-screen 0 2400x1600x24" node scripts/readme/capture.mjs <library> <out-dir>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const library = resolve(process.argv[2])
const out = resolve(process.argv[3])
const userData = join(root, 'tests/e2e/.tmp/readme/userdata')
const frames = join(out, '.frames')
rmSync(userData, { recursive: true, force: true })
rmSync(frames, { recursive: true, force: true })
mkdirSync(frames, { recursive: true })

const W = 1480
const H = 920
const app = await electron.launch({
  args: [join(root, 'out/main/index.js'), '--no-sandbox', '--force-device-scale-factor=1.25'],
  env: { ...process.env, LUMINA_USER_DATA: userData, ELECTRON_RENDERER_URL: '' }
})
const page = await app.firstWindow()
await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [W, H])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = async (name) => {
  await page.mouse.move(W - 2, H - 2) // park the cursor unless a shot positions it
  await sleep(200)
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('shot', name)
}
const shotHere = (name) => page.screenshot({ path: join(out, `${name}.png`) }).then(() => console.log('shot', name))
const lib = () => page.evaluate(() => window.lumina.getLibrary())
const byName = (l, n) => Object.values(l.videos).find((v) => v.name === n)

await page.getByText('Welcome to Lumina').waitFor()
await sleep(1500)
await shot('welcome')

// ---------------------------------------------------------------- build the library
await page.evaluate((p) => window.lumina.importPaths([p], { splitSubfolders: true }), library)
let l = await lib()
const style = {
  Travel: { emoji: '✈️', color: 'blue', description: 'Places I have been, and places I dream about.', pinned: true },
  Nature: { emoji: '🌿', color: 'emerald', description: 'Calm, green and deep blue.' },
  Music: { emoji: '🎵', color: 'pink', description: 'Visualizers and late-night mixes.' },
  Space: { emoji: '🌌', color: 'violet', description: 'Nebulae, galaxies and the quiet in between.' },
  Family: { emoji: '❤️', color: 'rose', description: 'Little moments, big memories.' },
  Tutorials: { emoji: '🎓', color: 'amber', description: 'Filmmaking lessons worth rewatching.' },
  Shorts: { emoji: '📱', color: 'cyan', description: 'Vertical clips.' }
}
for (const c of l.collections) if (style[c.name]) await page.evaluate(([id, s]) => window.lumina.updateCollection(id, s), [c.id, style[c.name]])
const order = Object.keys(style).map((n) => l.collections.find((c) => c.name === n)?.id).filter(Boolean)
await page.evaluate((ids) => window.lumina.reorderCollections(ids), order)

for (const n of ['Iceland - Northern Lights', 'Synthwave Drive', 'Nebula Journey', 'Tokyo Nights', "Mia's 5th Birthday"])
  await page.evaluate((id) => window.lumina.updateVideo(id, { favorite: true }), byName(l, n).id)
for (const n of ['Bali Beach Morning', 'Sahara Dunes', 'Neon Dreams', 'Weekend Picnic'])
  await page.evaluate((id) => window.lumina.updateVideo(id, { watched: true }), byName(l, n).id)
await page.evaluate((id) => window.lumina.updateVideo(id, { tags: ['iceland', 'night', 'aurora'], rating: 5 }), byName(l, 'Iceland - Northern Lights').id)
// Watch history: the most recent one becomes the "Continue watching" hero.
for (const n of ['Lo-fi Beats to Relax', 'Deep Ocean', 'Color Grading 101', 'Synthwave Drive', 'Tokyo Nights']) {
  await page.evaluate((id) => window.lumina.markPlayed(id), byName(l, n).id)
  await sleep(30)
}
// Durations are learned during thumbnailing; wait, then write real progress positions.
for (let i = 0; i < 240; i++) {
  l = await lib()
  if (Object.values(l.videos).every((v) => v.thumbAt || v.thumbFailed)) break
  await sleep(500)
}
for (const [n, frac] of [['Lo-fi Beats to Relax', 0.22], ['Deep Ocean', 0.71], ['Color Grading 101', 0.34], ['Synthwave Drive', 0.12], ['Tokyo Nights', 0.46]]) {
  const v = byName(l, n)
  await page.evaluate(([id, t, d]) => window.lumina.saveProgress(id, t, d), [v.id, v.duration * frac, v.duration])
}
await page.evaluate(() => window.lumina.updateSettings({ theme: 'aurora' }))
// Reload so the renderer picks up the silently-saved progress values.
await page.reload()
await page.getByTestId('nav-home').waitFor()
await sleep(1200)

// ---------------------------------------------------------------- screens
await page.getByTestId('nav-home').click()
await sleep(1600)
await shot('home')

await page.getByTestId('nav-collections').click()
await sleep(1400)
{
  const card = page.getByTestId('folder-card').filter({ hasText: 'Travel' })
  const b = await card.boundingBox()
  await page.mouse.move(b.x + b.width * 0.62, b.y + b.height * 0.55, { steps: 8 })
  await sleep(900)
  await shotHere('collections')
}

await page.getByTestId('folder-card').filter({ hasText: 'Travel' }).click()
await sleep(1400)
await shot('collection')

{
  const card = page.getByTestId('video-card').filter({ hasText: 'Tokyo Nights' })
  await card.click({ button: 'right' })
  await page.locator('.menu-item', { hasText: 'Add to collection' }).hover()
  await page.locator('.menu-item', { hasText: 'New collection' }).waitFor()
  await sleep(500)
  await shotHere('context-menu')
  await page.keyboard.press('Escape')
  await page.mouse.click(W - 20, H - 20)
}

await page.getByTestId('nav-all').click()
await sleep(600)
await page.getByTestId('view-list').click()
await sleep(1000)
await shot('list-view')
await page.locator('.segmented.icons button').first().click()
await sleep(300)

await page.getByTestId('nav-favorites').click()
await sleep(1200)
await shot('favorites')

await page.keyboard.press('Control+k')
await page.getByTestId('palette-input').type('ne', { delay: 60 })
await sleep(700)
await shotHere('palette')
await page.keyboard.press('Escape')

await page.getByTestId('new-collection').click()
await page.getByTestId('collection-name').type('Road Trip 2026', { delay: 30 })
await page.locator('.emoji-grid button', { hasText: '🏔️' }).click()
await page.locator('.swatch[title="orange"]').click()
await sleep(600)
await shotHere('collection-editor')
await page.keyboard.press('Escape')

await page.getByTestId('nav-settings').click()
await sleep(1000)
await shot('settings')

// ---------------------------------------------------------------- player
await page.getByTestId('nav-home').click()
await sleep(800)
await page.getByTestId('hero-play').click()
await page.getByTestId('player').waitFor()
await page.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1 && !document.querySelector('.player-loading'))
await sleep(1500)
{
  const bar = await page.getByTestId('seekbar').boundingBox()
  await page.mouse.move(W / 2, H / 2)
  await page.mouse.move(bar.x + bar.width * 0.63, bar.y + bar.height / 2, { steps: 6 })
  await sleep(1200)
  await shotHere('player')
}
await page.locator('.p-btn[title="Up next"]').click()
await sleep(900)
await page.mouse.move(W / 2, H / 2)
await sleep(300)
await shotHere('player-queue')
await page.keyboard.press('Escape')
await page.locator('.p-btn[title^="Speed"]').click()
await sleep(700)
await shotHere('player-speed')
await page.keyboard.press('Escape')
await page.getByTestId('player-close').click()
await page.getByTestId('player').waitFor({ state: 'detached' })

await page.getByTestId('nav-all').click()
await page.getByTestId('filter-input').fill('city lights')
await sleep(800)
await page.getByTestId('video-card').first().dblclick()
await page.waitForFunction(() => (document.querySelector('.player-video')?.currentTime ?? 0) > 1)
await sleep(1200)
await page.mouse.move(W / 2, H / 2)
await sleep(300)
await shotHere('player-vertical')
await page.getByTestId('player-close').click()
await page.getByTestId('player').waitFor({ state: 'detached' })
await page.getByTestId('filter-input').fill('')

// ---------------------------------------------------------------- every theme
for (const t of ['aurora', 'sunset', 'ocean', 'emerald', 'rose', 'mono']) {
  await page.evaluate((t) => window.lumina.updateSettings({ theme: t }), t)
  await page.getByTestId('nav-collections').click()
  await sleep(1300)
  await shot(`theme-${t}`)
  await page.getByTestId('nav-home').click()
}
await page.evaluate(() => window.lumina.updateSettings({ theme: 'aurora' }))

// ---------------------------------------------------------------- demo animation (CDP screencast)
const cdp = await page.context().newCDPSession(page)
const captured = []
cdp.on('Page.screencastFrame', async ({ data, sessionId, metadata }) => {
  captured.push({ t: metadata.timestamp, data })
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
})
await page.getByTestId('nav-collections').click()
await sleep(1200)
await page.mouse.move(80, 700)
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1850, maxHeight: 1150, everyNthFrame: 1 })
await sleep(500)
for (const name of ['Travel', 'Nature', 'Music', 'Space']) {
  const b = await page.getByTestId('folder-card').filter({ hasText: name }).boundingBox()
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.55, { steps: 14 })
  await sleep(750)
}
{
  const b = await page.getByTestId('folder-card').filter({ hasText: 'Travel' }).boundingBox()
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.55, { steps: 20 })
  await sleep(400)
  await page.mouse.click(b.x + b.width * 0.5, b.y + b.height * 0.55)
}
await sleep(1400)
{
  const b = await page.getByTestId('video-card').filter({ hasText: 'Santorini' }).boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 3, { steps: 16 })
  await sleep(900)
  await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 3)
}
await sleep(1800)
{
  const bar = await page.getByTestId('seekbar').boundingBox()
  await page.mouse.move(bar.x + bar.width * 0.2, bar.y + bar.height / 2, { steps: 10 })
  await page.mouse.move(bar.x + bar.width * 0.75, bar.y + bar.height / 2, { steps: 30 })
  await sleep(800)
}
await cdp.send('Page.stopScreencast')
captured.forEach((f, i) => writeFileSync(join(frames, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.data, 'base64')))
// ffmpeg concat list with real frame timings
const lines = []
captured.forEach((f, i) => {
  const next = captured[i + 1]?.t ?? f.t + 0.1
  lines.push(`file 'f${String(i).padStart(4, '0')}.jpg'`, `duration ${Math.max(0.02, next - f.t).toFixed(3)}`)
})
writeFileSync(join(frames, 'list.txt'), lines.join('\n') + '\n')
console.log('demo frames', captured.length)
await app.close()
