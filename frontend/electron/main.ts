import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import getPort from 'get-port'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = findProjectRoot(__dirname)

let pythonProcess: ReturnType<typeof spawn> | null = null
let backendPort: number = 0

process.env.APP_ROOT = APP_ROOT

function findProjectRoot(startDir: string): string {
  let dir = startDir
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    dir = path.dirname(dir)
  }
  return startDir
}

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(APP_ROOT, 'out')
export const RENDERER_DIST = path.join(APP_ROOT, 'out', 'renderer')

function resolveBackendPath(): { command: string; args: string[]; cwd: string } {
  if (app.isPackaged) {
    const exePath = path.join(process.resourcesPath, 'backend', 'backend.exe')
    return { command: exePath, args: [], cwd: path.dirname(exePath) }
  } else {
    const pythonPath = process.platform === 'win32'
      ? path.join(APP_ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
      : path.join(APP_ROOT, 'backend', 'venv', 'bin', 'python')
    return {
      command: pythonPath,
      args: ['-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1'],
      cwd: APP_ROOT
    }
  }
}

async function startPythonBackend(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const { command, args, cwd } = resolveBackendPath()
    const allArgs = [...args, '--port', String(port)]
    
    console.log(`[Main] Starting Python backend: ${command} ${allArgs.join(' ')}`)
    
    const env = {
      ...process.env,
      BACKEND_PORT: String(port),
      PYTHONPATH: APP_ROOT,
      TESSDATA_PREFIX: app.isPackaged
        ? path.join(process.resourcesPath, 'tesseract', 'tessdata')
        : undefined
    }

    pythonProcess = spawn(command, allArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    pythonProcess.stdout?.on('data', (data) => {
      output += data.toString()
      console.log(`[Python] ${data.toString().trim()}`)
    })

    pythonProcess.stderr?.on('data', (data) => {
      console.error(`[Python Error] ${data.toString().trim()}`)
    })

    pythonProcess.on('error', (err) => {
      console.error('[Main] Failed to start Python backend:', err)
      reject(err)
    })

    // Wait for server to be ready
    const checkReady = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok) {
          clearInterval(checkReady)
          console.log(`[Main] Python backend ready on port ${port}`)
          resolve()
        }
      } catch {
        // not ready yet
      }
    }, 500)

    setTimeout(() => {
      clearInterval(checkReady)
      reject(new Error('Python backend failed to start within 30 seconds'))
    }, 30000)
  })
}

function stopPythonBackend(): void {
  if (pythonProcess) {
    console.log('[Main] Stopping Python backend...')
    pythonProcess.kill('SIGTERM')
    pythonProcess = null
  }
}

async function createWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false
    }
  })

  // Start Python backend
  backendPort = await getPort({ port: [8765, 8766, 8767, 8768, 8769] })
  
  try {
    await startPythonBackend(backendPort)
  } catch (err) {
    console.error('[Main] Backend startup failed:', err)
    dialog.showErrorBox('Backend Error', 'Failed to start Python backend. Please check logs.')
    app.quit()
    return
  }

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// IPC handlers
ipcMain.handle('get-backend-port', () => backendPort)

ipcMain.handle('read-example-files', async () => {
  const exampleDir = path.join(APP_ROOT, 'example')
  const result: { folders: Record<string, string[]>; clientList: string | null } = { folders: {}, clientList: null }

  function scanDir(dir: string, parentKey: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          scanDir(fullPath, entry.name)
        } else if (entry.name.endsWith('.pdf')) {
          const folderName = parentKey || path.basename(dir)
          if (!result.folders[folderName]) result.folders[folderName] = []
          result.folders[folderName].push(fullPath)
        } else if (entry.name.endsWith('.xlsx') || entry.name.endsWith('.xls') || entry.name.endsWith('.csv')) {
          if (!result.clientList || entry.name.toLowerCase().includes('client')) {
            result.clientList = fullPath
          }
        }
      }
    } catch {}
  }

  scanDir(exampleDir, '')
  return result
})

ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
  try {
    const data = fs.readFileSync(filePath)
    return { name: path.basename(filePath), data: data.toString('base64'), path: filePath }
  } catch (e) {
    return null
  }
})

ipcMain.handle('select-file', async (_event, options: { filters?: Electron.FileFilter[]; properties?: ('openFile' | 'multiSelections')[] }) => {
  const result = await dialog.showOpenDialog({
    filters: options.filters,
    properties: options.properties || ['openFile']
  })
  return result
})

ipcMain.handle('show-save-dialog', async (_event, options: { defaultPath?: string; filters?: Electron.FileFilter[] }) => {
  const result = await dialog.showSaveDialog(options)
  return result
})

ipcMain.handle('get-app-version', () => app.getVersion())

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Set flags to reduce graphics-related errors - must be before app ready
app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
