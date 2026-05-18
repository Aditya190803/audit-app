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

export interface ElectronAPI {
  getBackendPort: () => Promise<number>
  selectFile: (options: {
    filters?: { name: string; extensions: string[] }[]
    properties?: ('openFile' | 'multiSelections')[]
  }) => Promise<{ canceled: boolean; filePaths: string[] }>
  showSaveDialog: (options: {
    defaultPath?: string
    filters?: { name: string; extensions: string[] }[]
  }) => Promise<{ canceled: boolean; filePath?: string }>
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<AppUpdateStatus>
  installUpdate: () => Promise<{ success: boolean; error?: string }>
  onUpdateStatus: (callback: (status: AppUpdateStatus) => void) => () => void
  readExampleFiles: () => Promise<{ folders: Record<string, string[]>; clientList: string | null }>
  readFileBase64: (filePath: string) => Promise<{ name: string; data: string; path: string } | null>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
