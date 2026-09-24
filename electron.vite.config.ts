import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: { resolve: { alias }, build: { outDir: 'out/main' } },
  preload: { resolve: { alias }, build: { outDir: 'out/preload' } },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
    build: { outDir: 'out/renderer', chunkSizeWarningLimit: 1500 }
  }
})
