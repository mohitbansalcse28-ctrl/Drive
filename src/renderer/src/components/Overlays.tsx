import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, ChevronRight, Clapperboard, FolderTree, Folder, Info, LayoutGrid, Play, Search, Upload, X } from 'lucide-react'
import { COLLECTION_COLORS, type CollectionColor } from '@shared/types'
import { api, matchesSearch, useStore, type MenuItem } from '../store'
import { playVideos, runImport } from '../lib/actions'
import { COLLECTION_GRADIENTS, formatBytes, formatDuration, thumbUrl, timeAgo } from '../lib/format'

// ---------------------------------------------------------------- context menu

function MenuList({ items, x, y, onDone, flipX }: { items: MenuItem[]; x: number; y: number; onDone: () => void; flipX?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [open, setOpen] = useState<{ index: number; x: number; y: number; flipX: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // offsetWidth/Height ignore the entrance scale transform, so the fit check is exact.
    const w = el.offsetWidth
    const h = el.offsetHeight
    let nx = x
    if (x + w > window.innerWidth - 8) nx = flipX !== undefined ? Math.max(8, flipX - w) : Math.max(8, window.innerWidth - w - 8)
    const ny = y + h > window.innerHeight - 8 ? Math.max(8, window.innerHeight - h - 8) : y
    setPos({ x: nx, y: ny })
  }, [x, y, flipX])

  const openSub = (i: number, target: HTMLElement) => {
    const r = target.getBoundingClientRect()
    setOpen({ index: i, x: r.right + 4, y: r.top - 6, flipX: r.left - 4 })
  }

  const menu = (
    <motion.div
      ref={ref}
      className="menu"
      style={{ left: pos.x, top: pos.y }}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="menu-divider" />
        ) : (
          <button
            key={i}
            className={`menu-item ${it.danger ? 'danger' : ''} ${open?.index === i ? 'open' : ''}`}
            disabled={it.disabled}
            onMouseEnter={(e) => (it.submenu ? openSub(i, e.currentTarget) : setOpen(null))}
            onClick={(e) => {
              if (it.submenu) return openSub(i, e.currentTarget)
              onDone()
              it.run?.()
            }}
          >
            <span className="menu-icon">{it.icon}</span>
            <span className="menu-label">{it.label}</span>
            {it.submenu && <ChevronRight size={14} />}
          </button>
        )
      )}
    </motion.div>
  )
  const sub = open && items[open.index]?.submenu
  return (
    <>
      {menu}
      {sub && createPortal(<MenuList items={sub} x={open.x} y={open.y} flipX={open.flipX} onDone={onDone} />, document.body)}
    </>
  )
}

export function ContextMenu() {
  const menu = useStore((s) => s.menu)
  const closeMenu = useStore((s) => s.closeMenu)
  useEffect(() => {
    if (!menu) return
    const close = () => closeMenu()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [menu, closeMenu])
  return <AnimatePresence>{menu && <MenuList key={`${menu.x}-${menu.y}`} items={menu.items} x={menu.x} y={menu.y} onDone={closeMenu} />}</AnimatePresence>
}

// ---------------------------------------------------------------- toasts

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  const dismiss = useStore((s) => s.dismissToast)
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast ${t.kind}`}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60 }}
            data-testid="toast"
          >
            {t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
            <span>{t.message}</span>
            {t.action && (
              <button className="link" onClick={t.action.run}>
                {t.action.label}
              </button>
            )}
            <button className="icon-btn sm" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------- modals

function ModalShell({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div
        className={`modal ${wide ? 'wide' : ''}`}
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

const EMOJI_CHOICES = ['🎬', '🎞️', '📼', '🍿', '🎥', '✨', '🌌', '🎮', '🎵', '🏔️', '🌊', '🔥', '📚', '🧪', '🏝️', '🚀', '❤️', '👶', '🐾', '⚽', '🎓', '🍳', '✈️', '🎤']

function CollectionEditor({ collectionId, addVideoIds, onClose }: { collectionId?: string; addVideoIds?: string[]; onClose: () => void }) {
  const lib = useStore((s) => s.lib)!
  const existing = lib.collections.find((c) => c.id === collectionId)
  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [color, setColor] = useState<CollectionColor>(existing?.color ?? COLLECTION_COLORS[lib.collections.length % COLLECTION_COLORS.length])
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎬')
  const navigate = useStore((s) => s.navigate)
  const toast = useStore((s) => s.toast)
  const [a, b] = COLLECTION_GRADIENTS[color]

  const save = async () => {
    if (!name.trim()) return
    if (existing) {
      await api.updateCollection(existing.id, { name, description, color, emoji })
      toast('Collection updated', 'success')
    } else {
      const c = await api.createCollection({ name, description, color, emoji })
      if (addVideoIds?.length) await api.addToCollection(c.id, addVideoIds)
      toast(`Created ${c.name}`, 'success')
      navigate({ name: 'collection', id: c.id })
    }
    onClose()
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="editor-preview" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
        <span>{emoji}</span>
        <strong>{name || 'Untitled collection'}</strong>
      </div>
      <h2>{existing ? 'Edit collection' : 'New collection'}</h2>
      <label className="field">
        <span>Name</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} placeholder="Summer trip, Tutorials, Anime…" data-testid="collection-name" />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
      </label>
      <div className="field">
        <span>Color</span>
        <div className="swatches">
          {COLLECTION_COLORS.map((c) => {
            const [x, y] = COLLECTION_GRADIENTS[c]
            return <button key={c} className={`swatch ${c === color ? 'on' : ''}`} style={{ background: `linear-gradient(135deg, ${x}, ${y})` }} onClick={() => setColor(c)} title={c} />
          })}
        </div>
      </div>
      <div className="field">
        <span>Icon</span>
        <div className="emoji-grid">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} className={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>
              {e}
            </button>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={!name.trim()} data-testid="collection-save">
          {existing ? 'Save changes' : 'Create collection'}
        </button>
      </div>
    </ModalShell>
  )
}

function ImportDialog({ paths, targetCollectionId, onClose }: { paths: string[]; targetCollectionId?: string; onClose: () => void }) {
  const [split, setSplit] = useState(!targetCollectionId)
  const target = useStore((s) => s.lib?.collections.find((c) => c.id === targetCollectionId))
  return (
    <ModalShell onClose={onClose}>
      <div className="import-hero">
        <Upload size={28} />
      </div>
      <h2>Import {paths.length > 1 ? `${paths.length} items` : 'folder'}</h2>
      <p className="muted path-list">{paths.slice(0, 4).join('\n')}{paths.length > 4 ? `\n+${paths.length - 4} more` : ''}</p>
      {target ? (
        <p className="muted">
          Videos will be added to <b>{target.name}</b>.
        </p>
      ) : (
        <div className="choice-grid">
          <button className={`choice ${!split ? 'on' : ''}`} onClick={() => setSplit(false)}>
            <Folder size={22} />
            <strong>One collection</strong>
            <small>Everything inside becomes a single collection</small>
          </button>
          <button className={`choice ${split ? 'on' : ''}`} onClick={() => setSplit(true)} data-testid="split-subfolders">
            <FolderTree size={22} />
            <strong>Collection per sub-folder</strong>
            <small>Each folder containing videos gets its own card</small>
          </button>
        </div>
      )}
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          data-testid="import-confirm"
          onClick={() => {
            onClose()
            void runImport(paths, split && !target, targetCollectionId)
          }}
        >
          Import
        </button>
      </div>
    </ModalShell>
  )
}

export function Modals() {
  const modal = useStore((s) => s.modal)
  const openModal = useStore((s) => s.openModal)
  const lib = useStore((s) => s.lib)
  const close = () => openModal(null)
  const infoVideo = modal?.kind === 'info' ? lib?.videos[modal.video.id] ?? modal.video : null
  return (
    <AnimatePresence>
      {modal?.kind === 'collection' && <CollectionEditor key="c" collectionId={modal.collection?.id} addVideoIds={modal.addVideoIds} onClose={close} />}
      {modal?.kind === 'import' && <ImportDialog key="i" paths={modal.paths} targetCollectionId={modal.targetCollectionId} onClose={close} />}
      {modal?.kind === 'confirm' && (
        <ModalShell key="x" onClose={close}>
          <h2>{modal.title}</h2>
          <p className="muted">{modal.body}</p>
          <div className="modal-actions">
            <button className="btn ghost" onClick={close}>
              Cancel
            </button>
            <button
              className={`btn ${modal.danger ? 'danger' : 'primary'}`}
              autoFocus
              data-testid="confirm"
              onClick={() => {
                close()
                modal.run()
              }}
            >
              {modal.confirmLabel}
            </button>
          </div>
        </ModalShell>
      )}
      {infoVideo && (
        <ModalShell key="n" onClose={close} wide>
          <div className="info-layout">
            <div className="info-thumb">{infoVideo.thumbAt ? <img src={thumbUrl(infoVideo.id, infoVideo.thumbAt)} alt="" /> : <Clapperboard size={40} />}</div>
            <div>
              <h2>{infoVideo.name}</h2>
              <dl className="info-grid">
                <dt>Path</dt>
                <dd className="mono">{infoVideo.path}</dd>
                <dt>Duration</dt>
                <dd>{formatDuration(infoVideo.duration)}</dd>
                <dt>Resolution</dt>
                <dd>{infoVideo.width ? `${infoVideo.width} × ${infoVideo.height}` : 'Unknown'}</dd>
                <dt>Size</dt>
                <dd>{formatBytes(infoVideo.size)}</dd>
                <dt>Added</dt>
                <dd>{new Date(infoVideo.addedAt).toLocaleString()}</dd>
                <dt>Played</dt>
                <dd>
                  {infoVideo.playCount}× · last {timeAgo(infoVideo.lastPlayedAt)}
                </dd>
                <dt>Rating</dt>
                <dd className="stars">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={n <= infoVideo.rating ? 'on' : ''} onClick={() => api.updateVideo(infoVideo.id, { rating: n === infoVideo.rating ? 0 : n })}>
                      ★
                    </button>
                  ))}
                </dd>
                <dt>Tags</dt>
                <dd>
                  <TagEditor id={infoVideo.id} tags={infoVideo.tags} />
                </dd>
              </dl>
            </div>
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={() => api.showInFolder(infoVideo.id)}>
              Show in Explorer
            </button>
            <button
              className="btn primary"
              onClick={() => {
                close()
                playVideos([infoVideo])
              }}
            >
              <Play size={16} fill="currentColor" /> Play
            </button>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  )
}

function TagEditor({ id, tags }: { id: string; tags: string[] }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const t = draft.trim().toLowerCase()
    if (t && !tags.includes(t)) void api.updateVideo(id, { tags: [...tags, t] })
    setDraft('')
  }
  return (
    <div className="tags">
      {tags.map((t) => (
        <span key={t} className="tag">
          #{t}
          <button onClick={() => api.updateVideo(id, { tags: tags.filter((x) => x !== t) })}>
            <X size={11} />
          </button>
        </span>
      ))}
      <input value={draft} placeholder="Add tag…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} onBlur={add} />
    </div>
  )
}

// ---------------------------------------------------------------- command palette

export function CommandPalette() {
  const open = useStore((s) => s.palette)
  const setPalette = useStore((s) => s.setPalette)
  const lib = useStore((s) => s.lib)
  const navigate = useStore((s) => s.navigate)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (open) {
      setQ('')
      setActive(0)
    }
  }, [open])

  const results = useMemo(() => {
    if (!lib) return []
    const query = q.trim().toLowerCase()
    const cols = lib.collections
      .filter((c) => !query || c.name.toLowerCase().includes(query))
      .slice(0, 5)
      .map((c) => ({ kind: 'collection' as const, id: c.id, title: c.name, sub: `${c.videoIds.length} videos`, emoji: c.emoji, thumb: undefined as string | undefined }))
    const vids = Object.values(lib.videos)
      .filter((v) => (query ? matchesSearch(v, query) : !!v.lastPlayedAt))
      .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))
      .slice(0, 8)
      .map((v) => ({ kind: 'video' as const, id: v.id, title: v.name, sub: `${formatDuration(v.duration)} · ${formatBytes(v.size)}`, emoji: '', thumb: thumbUrl(v.id, v.thumbAt) }))
    return [...cols, ...vids]
  }, [lib, q])

  const choose = (i: number) => {
    const r = results[i]
    if (!r || !lib) return
    setPalette(false)
    if (r.kind === 'collection') navigate({ name: 'collection', id: r.id })
    else playVideos([lib.videos[r.id]])
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modal-backdrop top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={() => setPalette(false)}>
          <motion.div className="palette" initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} onMouseDown={(e) => e.stopPropagation()}>
            <div className="palette-input">
              <Search size={18} />
              <input
                autoFocus
                value={q}
                placeholder="Search your library…"
                data-testid="palette-input"
                onChange={(e) => {
                  setQ(e.target.value)
                  setActive(0)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPalette(false)
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActive((a) => Math.min(a + 1, results.length - 1))
                  }
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActive((a) => Math.max(a - 1, 0))
                  }
                  if (e.key === 'Enter') choose(active)
                }}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette-results">
              {!results.length && <p className="muted center">No matches</p>}
              {results.map((r, i) => (
                <button key={r.kind + r.id} className={`palette-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
                  <span className="palette-thumb">{r.kind === 'collection' ? r.emoji : r.thumb ? <img src={r.thumb} alt="" /> : <Clapperboard size={16} />}</span>
                  <span className="palette-text">
                    <strong>{r.title}</strong>
                    <small>{r.sub}</small>
                  </span>
                  <span className="palette-kind">{r.kind === 'collection' ? <LayoutGrid size={14} /> : <Play size={14} />}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------- drag & drop from Explorer

export function DropZone() {
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const route = useStore((s) => s.route)
  useEffect(() => {
    const isFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files')
    const enter = (e: DragEvent) => {
      if (!isFiles(e)) return
      depth.current++
      setOver(true)
    }
    const leave = (e: DragEvent) => {
      if (!isFiles(e)) return
      depth.current = Math.max(0, depth.current - 1)
      if (!depth.current) setOver(false)
    }
    const overFn = (e: DragEvent) => isFiles(e) && e.preventDefault()
    const drop = (e: DragEvent) => {
      if (!isFiles(e)) return
      e.preventDefault()
      depth.current = 0
      setOver(false)
      const paths = [...(e.dataTransfer?.files ?? [])].map((f) => api.pathForFile(f)).filter(Boolean)
      if (!paths.length) return
      const target = useStore.getState().route
      const targetId = target.name === 'collection' ? target.id : undefined
      useStore.getState().openModal({ kind: 'import', paths, targetCollectionId: targetId })
    }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('dragover', overFn)
    window.addEventListener('drop', drop)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('dragover', overFn)
      window.removeEventListener('drop', drop)
    }
  }, [])
  return (
    <AnimatePresence>
      {over && (
        <motion.div className="dropzone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="dropzone-card" initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <Upload size={42} />
            <h2>Drop to import</h2>
            <p>{route.name === 'collection' ? 'Videos will be added to this collection' : 'Folders become collections automatically'}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
