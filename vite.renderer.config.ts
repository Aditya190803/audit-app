import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  renderer: {
    root: path.resolve(__dirname, 'frontend'),
    build: {
      outDir: path.resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'frontend/index.html')
        }
      }
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'frontend/src')
      }
    }
  }
})
