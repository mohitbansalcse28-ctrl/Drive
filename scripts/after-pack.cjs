// Stamps the Lumina icon + version metadata into Lumina.exe using a pure-JS PE editor,
// so Windows builds can be produced on Linux/macOS without Wine/rcedit.
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return
  const ResEdit = await import('resedit')
  const { NtExecutable, NtExecutableResource, Resource, Data } = ResEdit
  const { productFilename } = context.packager.appInfo
  const version = context.packager.appInfo.version
  const exePath = join(context.appOutDir, `${productFilename}.exe`)

  const exe = NtExecutable.from(readFileSync(exePath), { ignoreCert: true })
  const res = NtExecutableResource.from(exe)

  const iconFile = Data.IconFile.from(readFileSync(join(context.packager.projectDir, 'build/icon.ico')))
  for (const group of Resource.IconGroupEntry.fromEntries(res.entries)) {
    Resource.IconGroupEntry.replaceIconsForResource(
      res.entries,
      group.id,
      group.lang,
      iconFile.icons.map((i) => i.data)
    )
  }

  const [vi] = Resource.VersionInfo.fromEntries(res.entries)
  const [major, minor, patch] = version.split('.').map(Number)
  vi.setFileVersion(major, minor, patch, 0)
  vi.setProductVersion(major, minor, patch, 0)
  const lang = vi.getAllLanguagesForStringValues()[0] ?? { lang: 1033, codepage: 1200 }
  vi.setStringValues(lang, {
    FileDescription: 'Lumina — video player & library',
    ProductName: 'Lumina',
    CompanyName: 'Lumina',
    LegalCopyright: 'Copyright © 2026 Mohit Bansal',
    OriginalFilename: `${productFilename}.exe`,
    InternalName: productFilename,
    FileVersion: version,
    ProductVersion: version
  })
  vi.outputToResourceEntries(res.entries)

  res.outputResource(exe)
  writeFileSync(exePath, Buffer.from(exe.generate()))
  console.log(`  • stamped icon + version info into ${productFilename}.exe`)
}
