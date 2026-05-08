import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path from 'node:path'

export default defineConfig({
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'frontend/electron/preload.ts'),
        formats: ['cjs'],
        fileName: () => 'index.js'
      },
      outDir: 'out/preload'
    }
  }
})
