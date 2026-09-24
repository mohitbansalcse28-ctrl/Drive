// Adds progress hooks to electron-builder's NSIS extraction step (idempotent).
// electron-builder has no option for this, so the stock template is patched in place; the hooks
// are wrapped in `!ifmacrodef`, so the template behaves exactly as before without build/installer.nsh.
// Runs on `npm install` (postinstall) and before `npm run dist:win`.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const libDir = dirname(require.resolve('app-builder-lib/package.json'))
const file = join(libDir, 'templates/nsis/include/extractAppPackage.nsh')
const MARKER = '; lumina: progress hooks v2'

let src = readFileSync(file, 'utf8')
if (src.includes(MARKER)) {
  console.log('patch-nsis: already applied')
  process.exit(0)
}

const hook = (name, indent = '  ') =>
  `${indent}!ifmacrodef ${name}\n${indent}  !insertmacro ${name}\n${indent}!endif\n`

function replaceOnce(from, to) {
  const i = src.indexOf(from)
  if (i < 0) throw new Error(`patch-nsis: pattern not found (electron-builder template changed?):\n${from}`)
  src = src.slice(0, i) + to + src.slice(i + from.length)
}

// 1. Start driving the bar before the payload is copied out, and mark when it is ready.
replaceOnce(
  '  !insertmacro identify_package\n  !insertmacro compute_files_for_current_arch\n',
  `  ${MARKER}\n${hook('luminaProgressStart')}  !insertmacro identify_package\n  !insertmacro compute_files_for_current_arch\n${hook('luminaProgressPayloadReady')}`
)

// 2. Extract with a byte-progress callback instead of letting the plugin reset the bar.
replaceOnce(
  '  SetOutPath "$PLUGINSDIR\\7z-out"\n  Nsis7z::Extract "${FILE}"\n',
  '  SetOutPath "$PLUGINSDIR\\7z-out"\n  !ifmacrodef luminaExtract\n    !insertmacro luminaExtract "${FILE}"\n  !else\n    Nsis7z::Extract "${FILE}"\n  !endif\n'
)

// 3. Fresh install (nothing there that could be locked by a running app): extract straight into
//    the install folder instead of a temp folder + copy, removing a long silent stall.
replaceOnce(
  '!macro extractUsing7za FILE\n  Push $OUTDIR\n',
  '!macro extractUsing7za FILE\n  !ifmacrodef luminaExtractDirect\n    !insertmacro luminaExtractDirect "${FILE}"\n  !endif\n  Push $OUTDIR\n'
)

// 4. Files are in place.
replaceOnce('  DoneExtract7za:\n', `  DoneExtract7za:\n${hook('luminaProgressExtracted')}`)

writeFileSync(file, src)
console.log('patch-nsis: applied to', file)
