// Composes the README artwork (hero poster, framed screenshots, theme gallery) from raw captures.
//   node scripts/readme/compose.mjs <shots-dir> <docs-out-dir>
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium } from 'playwright-core'

const shots = resolve(process.argv[2])
const out = resolve(process.argv[3])
mkdirSync(join(out, 'screenshots'), { recursive: true })
const img = (name) => `data:image/png;base64,${readFileSync(join(shots, `${name}.png`)).toString('base64')}`
const logo = `data:image/png;base64,${readFileSync(resolve('build/icon.png')).toString('base64')}`

const candidates = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.CHROMIUM].filter(Boolean)
const browser = await chromium.launch({ executablePath: candidates.find((p) => existsSync(p)) })
const page = await browser.newPage({ deviceScaleFactor: 1 })

const base = `
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { font-family: Inter, 'Segoe UI', sans-serif; background: transparent; -webkit-font-smoothing: antialiased; }
    .frame { border-radius: 18px; overflow: hidden; border: 1px solid rgba(255,255,255,.12);
      box-shadow: 0 40px 80px -30px rgba(5,6,20,.75), 0 12px 30px -12px rgba(5,6,20,.5); background: #0e1016; }
    .frame img { display: block; width: 100%; }
  </style>`

async function render(html, file, selector, { width = 2400, height = 1400, transparent = true } = {}) {
  await page.setViewportSize({ width, height })
  await page.setContent(base + html, { waitUntil: 'load' })
  await page.evaluate(() => document.fonts.ready)
  await page.locator(selector).screenshot({ path: join(out, file), omitBackground: transparent })
  console.log('wrote', file)
}

// ---------------------------------------------------------------- hero poster
await render(
  `<div id="hero" style="position:relative;width:2400px;height:1300px;overflow:hidden;border-radius:36px;
      background: radial-gradient(900px 600px at 15% 10%, rgba(123,137,255,.35), transparent 70%),
                  radial-gradient(900px 700px at 90% 95%, rgba(182,156,255,.28), transparent 70%),
                  radial-gradient(700px 500px at 80% 10%, rgba(255,120,190,.14), transparent 70%), #090a10;">
    <div style="position:absolute;left:110px;top:110px;display:flex;align-items:center;gap:28px">
      <img src="${logo}" style="width:112px;height:112px;filter:drop-shadow(0 18px 40px rgba(123,137,255,.55))">
      <div>
        <div style="font-size:92px;font-weight:800;letter-spacing:-3px;color:#fff;line-height:1">Lumina</div>
        <div style="font-size:30px;color:#a8afc4;margin-top:10px;font-weight:500">Your videos, beautifully organized.</div>
      </div>
    </div>
    <div style="position:absolute;left:112px;top:330px;display:flex;gap:14px;flex-wrap:wrap;width:760px">
      ${['3D folder cards', 'Pro player', 'Instant resume', 'Ambient glow', 'Ctrl K search', '6 themes']
        .map((t) => `<span style="font-size:24px;color:#dfe3ff;padding:10px 20px;border-radius:999px;background:rgba(139,151,255,.14);border:1px solid rgba(139,151,255,.35)">${t}</span>`)
        .join('')}
    </div>
    <div class="frame" style="position:absolute;left:880px;top:95px;width:1420px;transform:perspective(2400px) rotateY(-9deg) rotateX(2deg);transform-origin:left center">
      <img src="${img('home')}">
    </div>
    <div class="frame" style="position:absolute;left:110px;top:560px;width:980px;transform:perspective(2400px) rotateY(7deg);transform-origin:right center">
      <img src="${img('collections')}">
    </div>
    <div class="frame" style="position:absolute;left:1180px;top:760px;width:860px;border-color:rgba(255,255,255,.2)">
      <img src="${img('player')}">
    </div>
  </div>`,
  'hero.png',
  '#hero',
  { width: 2400, height: 1300 }
)

// ---------------------------------------------------------------- framed screenshots
const frames = {
  home: 'home', collections: 'collections', collection: 'collection', player: 'player',
  'player-queue': 'player-queue', 'player-speed': 'player-speed', 'player-vertical': 'player-vertical',
  palette: 'palette', 'context-menu': 'context-menu', 'list-view': 'list-view', favorites: 'favorites',
  'collection-editor': 'collection-editor', welcome: 'welcome'
}
for (const [file, name] of Object.entries(frames)) {
  await render(
    `<div id="s" style="padding:40px 48px 70px"><div class="frame" style="width:1600px"><img src="${img(name)}"></div></div>`,
    `screenshots/${file}.png`,
    '#s',
    { width: 1800, height: 1200 }
  )
}
// Settings: top part only (the lower cards show a machine-specific data path).
await render(
  `<div id="s" style="padding:40px 48px 70px"><div class="frame" style="width:1600px;height:${Math.round(1600 * 0.64)}px"><img src="${img('settings')}"></div></div>`,
  'screenshots/settings.png',
  '#s',
  { width: 1800, height: 1200 }
)

// ---------------------------------------------------------------- theme gallery
const themes = [['aurora', 'Indigo', '#8b97ff'], ['sunset', 'Sunset', '#ff9061'], ['ocean', 'Ocean', '#4cc3f7'],
  ['emerald', 'Emerald', '#43d3a0'], ['rose', 'Rosé', '#f47fb7'], ['mono', 'Graphite', '#e4e7ee']]
await render(
  `<div id="t" style="display:grid;grid-template-columns:repeat(3,760px);gap:40px 36px;padding:30px 40px 60px">
    ${themes.map(([k, label, c]) => `
      <div>
        <div class="frame"><img src="${img(`theme-${k}`)}"></div>
        <div style="display:flex;align-items:center;gap:12px;margin-top:18px;font-size:26px;font-weight:600;color:#8b93a7">
          <span style="width:22px;height:22px;border-radius:7px;background:${c};box-shadow:0 0 0 1px rgba(0,0,0,.15)"></span>${label}
        </div>
      </div>`).join('')}
  </div>`,
  'themes.png',
  '#t',
  { width: 2500, height: 1500 }
)

await browser.close()
