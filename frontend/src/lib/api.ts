import axios from 'axios'
import type { HealthResponse, AuditSession, Transaction, Tag, Broker, AuditLog, TagSummary, ParseProgress } from '../types/api'

let backendPort: number | null = null
let backendToken: string | null = null

async function getBackendUrl(): Promise<string> {
  if (!backendPort) {
    if (typeof window !== 'undefined' && window.electronAPI) {
      if (window.electronAPI.getBackendConfig) {
        const config = await window.electronAPI.getBackendConfig()
        backendPort = config.port
        backendToken = config.token
      } else {
        backendPort = await window.electronAPI.getBackendPort()
      }
    } else {
      backendPort = 8765
    }
  }
  return `http://127.0.0.1:${backendPort}`
}

async function getClient() {
  const baseURL = await getBackendUrl()
  return axios.create({
    baseURL,
    timeout: 60000,
    headers: {
      'Content-Type': 'application/json',
      ...(backendToken ? { 'X-Audit-Token': backendToken } : {})
    }
  })
}

export async function healthCheck() {
  const client = await getClient()
  return client.get<HealthResponse>('/health')
}

export async function getSettings() {
  const client = await getClient()
  return client.get('/settings/')
}

export async function updateSettings(settings: Record<string, unknown>) {
  const client = await getClient()
  return client.patch('/settings/', { settings })
}

export async function resetSettings() {
  const client = await getClient()
  return client.post('/settings/reset')
}

export async function getSessions() {
  const client = await getClient()
  return client.get<AuditSession[]>('/sessions/', { params: { limit: 1000, offset: 0 } })
}

export async function getSession(id: number) {
  const client = await getClient()
  return client.get<AuditSession>(`/sessions/${id}`)
}

export async function deleteSession(id: number) {
  const client = await getClient()
  return client.delete(`/sessions/${id}`)
}

export async function renameSession(id: number, name: string) {
  const client = await getClient()
  return client.patch(`/sessions/${id}`, { name })
}

export async function getTransactions(sessionId: number) {
  const client = await getClient()
  const all: Transaction[] = []
  const limit = 10000
  let offset = 0

  while (true) {
    const response = await client.get<Transaction[]>(`/transactions/session/${sessionId}`, {
      params: { limit, offset }
    })
    all.push(...response.data)
    if (response.data.length < limit) {
      return { ...response, data: all }
    }
    offset += limit
  }
}

export async function updateReviewStatus(transactionId: number, status: 'unreviewed' | 'reviewed' | 'needs_review' | 'flagged') {
  const client = await getClient()
  return client.post(`/transactions/${transactionId}/review`, { status })
}

export async function updateTransactionNotes(transactionId: number, notes: string) {
  const client = await getClient()
  return client.post(`/transactions/${transactionId}/notes`, { notes })
}

export async function getParsers() {
  const client = await getClient()
  return client.get<{ name: string; display_name: string }[]>('/transactions/parsers')
}

export async function parseFiles(
  pdfFiles: File[],
  clientListFile: File,
  threshold: number,
  options: {
    password?: string
    sheetName?: string
    nameColumn?: string
    excludedBrokers?: string[]
    apCodes?: string[]
    bankName?: string
    progressId?: string
  } = {}
) {
  const client = await getClient()
  const formData = new FormData()
  for (const f of pdfFiles) {
    formData.append('pdf', f)
  }
  formData.append('client_list', clientListFile)
  formData.append('threshold', String(threshold))
  if (options.password) formData.append('password', options.password)
  if (options.sheetName) formData.append('sheet_name', options.sheetName)
  if (options.nameColumn) formData.append('name_column', options.nameColumn)
  if (options.bankName) formData.append('bank_name', options.bankName)
  if (options.progressId) formData.append('progress_id', options.progressId)
  if (options.excludedBrokers && options.excludedBrokers.length > 0) {
    formData.append('excluded_brokers', JSON.stringify(options.excludedBrokers))
  }
  if (options.apCodes && options.apCodes.length > 0) {
    formData.append('ap_codes', JSON.stringify(options.apCodes))
  }

  return client.post('/transactions/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 300000
  })
}

export async function getParseProgress(progressId: string) {
  const client = await getClient()
  return client.get<ParseProgress>(`/transactions/parse-progress/${progressId}`)
}

export async function getTagSummary(sessionId: number) {
  const client = await getClient()
  return client.get<TagSummary>(`/transactions/session/${sessionId}/tags/summary`)
}

export async function getTags(transactionId: number) {
  const client = await getClient()
  return client.get<Tag[]>(`/tags/transaction/${transactionId}`)
}

export async function addTag(transactionId: number, tagType: string, reason?: string, confidence?: number, source?: string, is_manual?: boolean) {
  const client = await getClient()
  return client.post<Tag>('/tags/', {
    transaction_id: transactionId,
    tag_type: tagType,
    reason,
    confidence,
    source: source ?? 'manual',
    is_manual: is_manual ?? true
  })
}

export async function removeTag(tagId: number) {
  const client = await getClient()
  return client.delete(`/tags/${tagId}`)
}

export async function bulkRemoveTags(tagIds: number[]) {
  const client = await getClient()
  return client.post('/tags/bulk-remove', tagIds)
}

export async function bulkAddTags(transactionIds: number[], tagType: string) {
  const client = await getClient()
  return client.post('/tags/bulk-add', { transaction_ids: transactionIds, tag_type: tagType })
}

export async function getBrokers() {
  const client = await getClient()
  return client.get<Broker[]>('/brokers/')
}

export async function createBroker(name: string, aliases: string[] = []) {
  const client = await getClient()
  return client.post<Broker>('/brokers/', { name, aliases, is_active: true })
}

export async function updateBroker(id: number, name: string, aliases: string[], is_active: boolean) {
  const client = await getClient()
  return client.put<Broker>(`/brokers/${id}`, { name, aliases, is_active })
}

export async function deleteBroker(id: number) {
  const client = await getClient()
  return client.delete(`/brokers/${id}`)
}

export async function exportFile(sessionId: number, exportType: string, format: string, filePath?: string, transactionIds?: number[], exportPathToken?: string) {
  if (format !== 'excel') {
    throw new Error(`Unsupported export format: ${format}`)
  }

  const client = await getClient()
  const endpoint = 'excel'
  const params: Record<string, string> = { export_type: exportType }
  if (filePath) params.file_path = filePath
  if (exportPathToken) params.export_path_token = exportPathToken
  if (transactionIds && transactionIds.length > 0) {
    params.transaction_ids = JSON.stringify(transactionIds)
  }
  return client.post(`/export/${endpoint}/${sessionId}`, null, { params })
}

export async function getAuditLogs(sessionId: number, limit?: number) {
  const client = await getClient()
  return client.get<AuditLog[]>(`/audit/session/${sessionId}`, { params: { limit } })
}
