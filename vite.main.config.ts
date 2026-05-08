import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'frontend/electron/main.ts'),
      },
      outDir: 'out/main',
      rollupOptions: {
        external: ['electron']
      }
    },
    resolve: {
      alias: {
        '@electron': path.resolve(__dirname, 'frontend/electron')
      }
    }
  }
})
