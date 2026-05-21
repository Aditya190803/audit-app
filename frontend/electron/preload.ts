import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface AppUpdateStatus {
  status: UpdateStatus
  message: string
  version?: string
  releaseName?: string
  releaseDate?: string
  percent?: number
}

export interface BackendCrashEvent {
  code: number | null
  signal: string | null
}

export interface ElectronAPI {
  getBackendPort: () => Promise<number>
  getBackendConfig: () => Promise<{ port: number; token: string }>
  selectFile: (options: { filters?: { name: string; extensions: string[] }[]; properties?: ('openFile' | 'multiSelections')[] }) => Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog: (options: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ canceled: boolean; filePath?: string; exportPathToken?: string }>
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<{ success: boolean; error?: string }>
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void
  onBackendCrashed: (callback: (event: BackendCrashEvent) => void) => () => void
  readExampleFiles: () => Promise<{ folders: Record<string, string[]>; clientList: string | null }>
  readFileBase64: (filePath: string) => Promise<{ name: string; data: string; path: string } | null>
}

const api: ElectronAPI = {
  getBackendPort: () => ipcRenderer.invoke('get-backend-port'),
  getBackendConfig: () => ipcRenderer.invoke('get-backend-config'),
  selectFile: (options) => ipcRenderer.invoke('select-file', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback) => {
    const handler = (_event: IpcRendererEvent, status: AppUpdateStatus) => callback(status)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
  onBackendCrashed: (callback) => {
    const handler = (_event: IpcRendererEvent, payload: BackendCrashEvent) => callback(payload)
    ipcRenderer.on('backend-crashed', handler)
    return () => ipcRenderer.removeListener('backend-crashed', handler)
  },
  readExampleFiles: () => ipcRenderer.invoke('read-example-files'),
  readFileBase64: (filePath) => ipcRenderer.invoke('read-file-base64', filePath)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback for when contextIsolation is disabled)
  window.electronAPI = api
}
