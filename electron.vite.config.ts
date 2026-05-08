import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'frontend/electron/main.ts'),
        formats: ['cjs'],
        fileName: 'index'
      },
      outDir: 'out/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: path.resolve(__dirname, 'frontend/electron/preload.ts'),
        formats: ['cjs'],
        fileName: 'index'
      },
      outDir: 'out/preload'
    }
  },
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
