import { app, BrowserWindow, ipcMain, dialog, session } from 'electron'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import getPort from 'get-port'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = findProjectRoot(__dirname)

let pythonProcess: ReturnType<typeof spawn> | null = null
let mainWindow: BrowserWindow | null = null
let backendPort: number = 0
let backendToken = crypto.randomBytes(32).toString('hex')
let exportPathSecret = crypto.randomBytes(32).toString('hex')
let updateStatus: UpdateStatus = {
  status: 'idle',
  message: 'Updates have not been checked yet.'
}

type UpdateStatusName =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

type UpdateStatus = {
  status: UpdateStatusName
  message: string
  version?: string
  releaseName?: string
  releaseDate?: string
  percent?: number
}

const UPDATE_FEED_URL = process.env.UPDATE_FEED_URL || 'https://the-ska-auditing-app.vercel.app/releases'
const LICENSE_CHECK_URL = process.env.LICENSE_CHECK_URL || 'https://the-ska-auditing-app.vercel.app/api/license'

type BackendCrashPayload = {
  code: number | null
  signal: NodeJS.Signals | null
}

process.env.APP_ROOT = APP_ROOT

autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = true

function publishUpdateStatus(next: UpdateStatus): UpdateStatus {
  updateStatus = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update-status', updateStatus)
  }
  return updateStatus
}

function publishBackendCrash(payload: BackendCrashPayload): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('backend-crashed', payload)
    }
  }
}

function installContentSecurityPolicy(): void {
  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:* https://the-ska-auditing-app.vercel.app",
    "worker-src 'self' blob:"
  ].join('; ')

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy]
      }
    })
  })
}

function normalizeUpdateInfo(status: UpdateStatusName, message: string, info?: UpdateInfo): UpdateStatus {
  return {
    status,
    message,
    version: info?.version,
    releaseName: info?.releaseName || undefined,
    releaseDate: info?.releaseDate
  }
}

function dataPath(...segments: string[]): string {
  return app.isPackaged
    ? path.join(app.getPath('userData'), ...segments)
    : path.join(APP_ROOT, ...segments)
}

function canonicalPath(filePath: string): string {
  return path.resolve(filePath)
}

function exportPathToken(filePath: string): string {
  return crypto
    .createHmac('sha256', exportPathSecret)
    .update(canonicalPath(filePath))
    .digest('hex')
}

function configureUpdates(): void {
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_FEED_URL
  })
}

autoUpdater.on('checking-for-update', () => {
  publishUpdateStatus({ status: 'checking', message: 'Checking for updates...' })
})

autoUpdater.on('update-available', (info) => {
  publishUpdateStatus(normalizeUpdateInfo('available', `Version ${info.version} is available. Downloading update...`, info))
})

autoUpdater.on('update-not-available', (info) => {
  publishUpdateStatus(normalizeUpdateInfo('not-available', `You are already on the latest version (${app.getVersion()}).`, info))
})

autoUpdater.on('download-progress', (progress) => {
  publishUpdateStatus({
    status: 'downloading',
    message: `Downloading update (${Math.round(progress.percent)}%)...`,
    percent: progress.percent
  })
})

autoUpdater.on('update-downloaded', (info) => {
  publishUpdateStatus(normalizeUpdateInfo('downloaded', `Version ${info.version} is ready to install.`, info))
})

autoUpdater.on('error', (error) => {
  publishUpdateStatus({
    status: 'error',
    message: error instanceof Error ? error.message : String(error)
  })
})

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
    const executableName = process.platform === 'win32' ? 'backend.exe' : 'backend'
    const candidates = [
      path.join(process.resourcesPath, 'backend', executableName),
      path.join(process.resourcesPath, 'backend', 'backend', executableName)
    ]
    const exePath = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0]
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
    // Ensure writeable directories exist before spawning the Python backend
    try {
      const dbDir = app.isPackaged ? app.getPath('userData') : APP_ROOT;
      const uploadsDir = dataPath('uploads');
      const exportsDir = dataPath('exports');

      for (const dir of [dbDir, uploadsDir, exportsDir]) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
    } catch (err) {
      console.error('[Main] Failed to create data directories:', err);
    }

    const { command, args, cwd } = resolveBackendPath()
    const allArgs = [...args, '--port', String(port)]

    console.log(`[Main] Starting Python backend: ${command} ${allArgs.join(' ')}`)

    const env = {
      ...process.env,
      BACKEND_PORT: String(port),
      PYTHONPATH: APP_ROOT,
      AUDIT_DB_PATH: app.isPackaged
        ? path.join(app.getPath('userData'), 'audit.db')
        : undefined,
      AUDIT_UPLOAD_DIR: dataPath('uploads'),
      AUDIT_EXPORT_DIR: dataPath('exports'),
      AUDIT_API_TOKEN: backendToken,
      AUDIT_EXPORT_PATH_SECRET: exportPathSecret,
      AUDIT_DISABLE_DOCS: app.isPackaged ? '1' : undefined,
      AUDIT_ALLOWED_ORIGINS: VITE_DEV_SERVER_URL
        ? VITE_DEV_SERVER_URL.replace(/\/$/, '')
        : 'file://',
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

    let settled = false
    let checkReady: NodeJS.Timeout | null = null
    let startupTimeout: NodeJS.Timeout | null = null

    const cleanupStartupTimers = () => {
      if (checkReady) clearInterval(checkReady)
      if (startupTimeout) clearTimeout(startupTimeout)
    }

    pythonProcess.on('error', (err) => {
      console.error('[Main] Failed to start Python backend:', err)
      cleanupStartupTimers()
      if (!settled) {
        settled = true
        reject(err)
      }
    })

    pythonProcess.on('exit', (code, signal) => {
      console.error(`[Main] Python backend terminated with code ${code} and signal ${signal}`)
      const crashedDuringStartup = !settled
      pythonProcess = null
      cleanupStartupTimers()
      publishBackendCrash({ code, signal })
      if (crashedDuringStartup) {
        settled = true
        reject(new Error(`Python backend terminated before startup completed (${code ?? signal ?? 'unknown'})`))
      }
    })

    // Wait for server to be ready
    checkReady = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`)
        if (res.ok) {
          cleanupStartupTimers()
          console.log(`[Main] Python backend ready on port ${port}`)
          if (!settled) {
            settled = true
            resolve()
          }
        }
      } catch {
        // not ready yet
      }
    }, 500)

    startupTimeout = setTimeout(() => {
      cleanupStartupTimers()
      if (!settled) {
        settled = true
        reject(new Error('Python backend failed to start within 30 seconds'))
      }
    }, 30000)
  })
}

function stopPythonBackend(): void {
  const proc = pythonProcess
  if (!proc) return

  console.log('[Main] Stopping Python backend...')
  proc.kill('SIGTERM')

  const killTimeout = setTimeout(() => {
    if (pythonProcess === proc) {
      console.warn('[Main] Python backend did not exit after SIGTERM; sending SIGKILL.')
      proc.kill('SIGKILL')
    }
  }, 3000)

  proc.once('exit', () => clearTimeout(killTimeout))
}

async function checkLicense(): Promise<'active' | 'revoked'> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const res = await fetch(`${LICENSE_CHECK_URL}?appId=com.bankaudit.app`, {
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (res.status === 403) return 'revoked'
    return 'active'
  } catch {
    // Network error → fail-open, allow the app to work
    console.warn('[Main] License check failed (network error) — proceeding as active.')
    return 'active'
  }
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: true
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
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }

  // License check — runs after window loads so the overlay can be shown
  mainWindow.webContents.once('did-finish-load', async () => {
    const licenseStatus = await checkLicense()
    if (licenseStatus === 'revoked') {
      mainWindow?.webContents.send('license-revoked')
    }
  })
}

// IPC handlers
ipcMain.handle('get-backend-port', () => backendPort)
ipcMain.handle('get-backend-config', () => ({ port: backendPort, token: backendToken }))

ipcMain.handle('read-example-files', async () => {
  const exampleDir = path.join(APP_ROOT, 'example')
  const result: { folders: Record<string, string[]>; clientList: string | null } = { folders: {}, clientList: null }

  function scanDir(dir: string, relativeKey: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          const childKey = relativeKey ? `${relativeKey}/${entry.name}` : entry.name
          scanDir(fullPath, childKey)
        } else if (entry.name.endsWith('.pdf')) {
          const groupKey = relativeKey || path.basename(dir)
          if (!result.folders[groupKey]) result.folders[groupKey] = []
          result.folders[groupKey].push(fullPath)
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

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xlsx', '.xls', '.csv'])
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

function isWithinRoot(filePath: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
  try {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(APP_ROOT, filePath)
    const resolved = path.resolve(resolvedPath)

    const allowedRoots = [APP_ROOT, dataPath('uploads'), dataPath('exports')]
    if (!allowedRoots.some((root) => isWithinRoot(resolved, root))) {
      console.error(`[Main] Blocked read outside allowed roots: ${resolved}`)
      return null
    }

    // Validate extension
    const ext = path.extname(resolved).toLowerCase()
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      console.error(`[Main] Blocked disallowed extension: ${ext} for ${resolved}`)
      return null
    }

    if (!fs.existsSync(resolved)) {
      console.error(`[Main] File not found: ${resolved}`)
      return null
    }

    const stat = fs.statSync(resolved)
    if (stat.size > MAX_FILE_SIZE) {
      console.error(`[Main] File too large: ${stat.size} > ${MAX_FILE_SIZE}`)
      return null
    }

    const data = fs.readFileSync(resolved)
    return { name: path.basename(resolved), data: data.toString('base64'), path: resolved }
  } catch (e) {
    console.error(`[Main] Failed to read file: ${filePath}`, e)
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
  if (result.canceled || !result.filePath) return result
  return {
    ...result,
    exportPathToken: exportPathToken(result.filePath)
  }
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return publishUpdateStatus({
      status: 'unsupported',
      message: 'Update checks are available in packaged builds.'
    })
  }

  try {
    configureUpdates()
    publishUpdateStatus({ status: 'checking', message: 'Checking for updates...' })
    await autoUpdater.checkForUpdates()
    return updateStatus
  } catch (error) {
    return publishUpdateStatus({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    })
  }
})

ipcMain.handle('install-update', async () => {
  if (updateStatus.status !== 'downloaded') {
    return { success: false, error: 'No downloaded update is ready to install.' }
  }

  setImmediate(() => autoUpdater.quitAndInstall())
  return { success: true }
})

app.on('window-all-closed', () => {
  stopPythonBackend()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Set flags to reduce graphics-related errors - must be before app ready
app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

app.whenReady().then(() => {
  installContentSecurityPolicy()
  return createWindow().then(() => {
    // Auto-check for updates 5s after window is ready
    if (app.isPackaged) {
      setTimeout(() => {
        configureUpdates()
        autoUpdater.checkForUpdates().catch((err) => {
          console.error('[Main] Auto-update check failed:', err)
        })
      }, 5000)
    }
  })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
