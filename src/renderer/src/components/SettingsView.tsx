import { useEffect, useState, type ReactNode } from 'react'
import { Database, ImageOff, Keyboard, Palette, PlayCircle, Settings2, Trash2 } from 'lucide-react'
import type { Settings, ThemeName } from '@shared/types'
import { api, useStore } from '../store'
import { THEMES } from '../lib/format'

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="settings-card">
      <h2>
        {icon} {title}
      </h2>
      {children}
    </section>
  )
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="setting-row">
      <div>
        <strong>{label}</strong>
        {hint && <small>{hint}</small>}
      </div>
      <button className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} role="switch" aria-checked={value}>
        <span />
      </button>
    </label>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Space / K', 'Play / pause'],
  ['← / →', 'Seek 5s (Shift 30s, Ctrl 60s)'],
  ['J / L', 'Seek back / forward by step'],
  ['↑ / ↓ · wheel', 'Volume (up to 200%)'],
  ['M', 'Mute'],
  ['F · double-click', 'Fullscreen'],
  ['N / P', 'Next / previous video'],
  ['[ / ] · =', 'Slower / faster · reset speed'],
  ['0 – 9', 'Jump to 0% – 90%'],
  [', / .', 'Frame step (paused)'],
  ['B', 'A-B loop'],
  ['C', 'Subtitles'],
  ['S', 'Save snapshot'],
  ['A', 'Aspect: fit / crop / stretch'],
  ['I', 'Stats for nerds'],
  ['Ctrl K', 'Search everything'],
  ['Ctrl A', 'Select all videos'],
  ['Delete', 'Remove selected from collection'],
  ['Alt ←', 'Go back']
]

export function SettingsView() {
  const lib = useStore((s) => s.lib)!
  const toast = useStore((s) => s.toast)
  const openModal = useStore((s) => s.openModal)
  const [dataDir, setDataDir] = useState('')
  const s = lib.settings
  const set = (patch: Partial<Settings>) => void api.updateSettings(patch)
  useEffect(() => void api.dataDir().then(setDataDir), [])
  const missing = Object.values(lib.videos).filter((v) => v.missing).length

  return (
    <div className="page settings">
      <div className="page-header">
        <div className="page-header-icon">
          <Settings2 size={22} />
        </div>
        <div>
          <h1>Settings</h1>
          <p>Make Lumina yours</p>
        </div>
      </div>

      <div className="settings-grid">
        <Section icon={<Palette size={18} />} title="Appearance">
          <div className="theme-grid">
            {(Object.keys(THEMES) as ThemeName[]).map((t) => (
              <button key={t} className={`theme-chip ${s.theme === t ? 'on' : ''}`} onClick={() => set({ theme: t })} data-testid={`theme-${t}`}>
                <span style={{ background: `linear-gradient(135deg, ${THEMES[t].accent}, ${THEMES[t].accent2})` }} />
                {THEMES[t].label}
              </button>
            ))}
          </div>
          <label className="setting-row">
            <div>
              <strong>Card size</strong>
              <small>{s.cardSize}px</small>
            </div>
            <input type="range" min={180} max={380} step={10} value={s.cardSize} onChange={(e) => set({ cardSize: Number(e.target.value) })} />
          </label>
          <Toggle label="Reduce motion" hint="Disable tilt, hover previews and entrance animations" value={s.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
        </Section>

        <Section icon={<PlayCircle size={18} />} title="Playback">
          <Toggle label="Autoplay next video" hint="Counts down 5 seconds before moving on" value={s.autoplayNext} onChange={(v) => set({ autoplayNext: v })} />
          <Toggle label="Resume where you left off" value={s.resumePlayback} onChange={(v) => set({ resumePlayback: v })} />
          <Toggle label="Ambient mode" hint="Softly light the background with colors from the video" value={s.ambientMode} onChange={(v) => set({ ambientMode: v })} />
          <label className="setting-row">
            <div>
              <strong>Default volume</strong>
              <small>{Math.round(s.defaultVolume * 100)}%</small>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={s.defaultVolume} onChange={(e) => set({ defaultVolume: Number(e.target.value) })} />
          </label>
          <label className="setting-row">
            <div>
              <strong>Default speed</strong>
            </div>
            <select value={s.defaultSpeed} onChange={(e) => set({ defaultSpeed: Number(e.target.value) })}>
              {[0.75, 1, 1.25, 1.5, 1.75, 2].map((v) => (
                <option key={v} value={v}>
                  {v}×
                </option>
              ))}
            </select>
          </label>
          <label className="setting-row">
            <div>
              <strong>Seek step (J / L)</strong>
            </div>
            <select value={s.seekStep} onChange={(e) => set({ seekStep: Number(e.target.value) })}>
              {[5, 10, 15, 30, 60].map((v) => (
                <option key={v} value={v}>
                  {v} seconds
                </option>
              ))}
            </select>
          </label>
        </Section>

        <Section icon={<Database size={18} />} title="Library">
          <label className="setting-row">
            <div>
              <strong>Thumbnail frame</strong>
              <small>Where in each video the cover frame is taken</small>
            </div>
            <select value={s.thumbnailAt} onChange={(e) => set({ thumbnailAt: Number(e.target.value) })}>
              {[0.05, 0.1, 0.2, 0.33, 0.5].map((v) => (
                <option key={v} value={v}>
                  {Math.round(v * 100)}%
                </option>
              ))}
            </select>
          </label>
          <div className="setting-row">
            <div>
              <strong>Regenerate thumbnails</strong>
              <small>Clears the cache and rebuilds every cover</small>
            </div>
            <button
              className="btn ghost sm"
              onClick={async () => {
                await api.resetThumbs()
                toast('Regenerating thumbnails…', 'success')
              }}
            >
              <ImageOff size={14} /> Rebuild
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Missing files</strong>
              <small>{missing ? `${missing} videos can’t be found on disk` : 'Everything is where it should be'}</small>
            </div>
            <button
              className="btn ghost sm"
              disabled={!missing}
              onClick={() =>
                openModal({
                  kind: 'confirm',
                  title: `Remove ${missing} missing videos?`,
                  body: 'They are removed from the library and all collections.',
                  confirmLabel: 'Clean up',
                  danger: true,
                  run: async () => toast(`Removed ${await api.cleanupMissing()} entries`, 'success')
                })
              }
            >
              <Trash2 size={14} /> Clean up
            </button>
          </div>
          <div className="setting-row">
            <div>
              <strong>Library location</strong>
              <small className="mono">{dataDir}</small>
            </div>
          </div>
        </Section>

        <Section icon={<Keyboard size={18} />} title="Keyboard shortcuts">
          <div className="shortcuts">
            {SHORTCUTS.map(([k, d]) => (
              <div key={k} className="shortcut">
                <kbd>{k}</kbd>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
      <p className="about">Lumina 1.1.0 · Made with ♥ for beautiful libraries</p>
    </div>
  )
}
