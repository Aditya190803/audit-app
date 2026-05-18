import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import getPort from 'get-port'
import fs from 'node:fs'
import { autoUpdater, type UpdateInfo } from 'electron-updater'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = findProjectRoot(__dirname)

let pythonProcess: ReturnType<typeof spawn> | null = null
let backendPort: number = 0
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

type GitHubUpdateConfig = {
  owner: string
  repo: string
  token?: string
  privateRepo: boolean
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

function normalizeUpdateInfo(status: UpdateStatusName, message: string, info?: UpdateInfo): UpdateStatus {
  return {
    status,
    message,
    version: info?.version,
    releaseName: info?.releaseName || undefined,
    releaseDate: info?.releaseDate
  }
}

function readOptionalTextFile(filePath?: string): string | null {
  if (!filePath) return null

  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return null
    return fs.readFileSync(resolved, 'utf8').trim() || null
  } catch {
    return null
  }
}

function readGitHubUpdateToken(): string | null {
  return (
    process.env.UPDATE_GITHUB_TOKEN?.trim() ||
    process.env.GH_TOKEN?.trim() ||
    readOptionalTextFile(process.env.UPDATE_GITHUB_TOKEN_FILE) ||
    readOptionalTextFile(path.join(app.getPath('userData'), 'github-update-token')) ||
    null
  )
}

function isTruthyEnv(value?: string): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes'
}

function getGitHubUpdateConfig(): GitHubUpdateConfig | null {
  const repository = process.env.UPDATE_GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY
  const [envOwner, envRepo] = [process.env.UPDATE_GITHUB_OWNER, process.env.UPDATE_GITHUB_REPO]
  const token = readGitHubUpdateToken() || undefined
  const privateRepo = isTruthyEnv(process.env.UPDATE_GITHUB_PRIVATE) || Boolean(token)

  if (envOwner && envRepo) {
    return { owner: envOwner, repo: envRepo, token, privateRepo }
  }

  if (repository) {
    const match = repository.match(/(?:github\.com[/:])?([^/\s]+)\/([^/\s.]+)(?:\.git)?$/)
    if (match) {
      return { owner: match[1], repo: match[2], token, privateRepo }
    }
  }

  return null
}

function configureGitHubUpdates(): { ok: true } | { ok: false; message: string } {
  const config = getGitHubUpdateConfig()
  if (!config) {
    return {
      ok: false,
      message: 'Set UPDATE_GITHUB_OWNER and UPDATE_GITHUB_REPO, or GITHUB_REPOSITORY, to enable GitHub release updates.'
    }
  }

  if (config.privateRepo && !config.token) {
    return {
      ok: false,
      message: 'Private GitHub updates require GH_TOKEN, UPDATE_GITHUB_TOKEN, UPDATE_GITHUB_TOKEN_FILE, or a github-update-token file in app data.'
    }
  }

  autoUpdater.requestHeaders = null
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: config.owner,
    repo: config.repo,
    private: config.privateRepo,
    token: config.token
  })

  if (config.token) {
    autoUpdater.addAuthHeader(`token ${config.token}`)
  }

  return { ok: true }
}

autoUpdater.on('checking-for-update', () => {
  publishUpdateStatus({ status: 'checking', message: 'Checking GitHub releases...' })
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
      AUDIT_DB_PATH: app.isPackaged
        ? path.join(app.getPath('userData'), 'audit.db')
        : undefined,
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
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools()
    }
  } else {
    mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// IPC handlers
ipcMain.handle('get-backend-port', () => backendPort)

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

ipcMain.handle('read-file-base64', async (_event, filePath: string) => {
  try {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(APP_ROOT, filePath)
    const resolved = path.resolve(resolvedPath)

    // Only allow files within APP_ROOT
    if (!resolved.startsWith(APP_ROOT)) {
      console.error(`[Main] Blocked read outside APP_ROOT: ${resolved}`)
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
  return result
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return publishUpdateStatus({
      status: 'unsupported',
      message: 'Update checks are available in packaged builds.'
    })
  }

  const updateConfig = configureGitHubUpdates()
  if (!updateConfig.ok) {
    return publishUpdateStatus({
      status: 'unsupported',
      message: updateConfig.message
    })
  }

  try {
    publishUpdateStatus({ status: 'checking', message: 'Checking GitHub releases...' })
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

app.whenReady().then(createWindow)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})
