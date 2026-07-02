import { create } from 'zustand'
import { deleteSession as deleteSessionApi, getSessions, getTagSummary, getTransactions, parseFiles } from '../lib/api'
import type { Transaction, AuditSession, TagSummary, ParseProgress } from '../types/api'

interface SessionState {
  sessions: AuditSession[]
  currentSession: AuditSession | null
  transactions: Transaction[]
  tagSummary: TagSummary | null
  isLoading: boolean
  isProcessing: boolean
  processingProgress: ParseProgress | null
  processingError: string | null
  clearProcessingError: () => void
  loadSessions: () => Promise<void>
  loadTransactions: (sessionId: number) => Promise<void>
  loadTagSummary: (sessionId: number) => Promise<void>
  setCurrentSession: (session: AuditSession | null) => void
  processFiles: (
    pdf: File | File[],
    clientList: File,
    threshold: number,
    options?: {
      password?: string
      sheetName?: string
      nameColumn?: string
      codeColumn?: string
      excludedBrokers?: string[]
      apCodes?: string[]
      bankName?: string
      pdfHashes?: Record<string, string>
    }
  ) => Promise<number | null>
  deleteSession: (sessionId: number) => Promise<void>
  refreshCurrentSession: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  currentSession: null,
  transactions: [],
  tagSummary: null,
  isLoading: false,
  isProcessing: false,
  processingProgress: null,
  processingError: null,
  clearProcessingError: () => set({ processingError: null }),
  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const res = await getSessions()
      set({ sessions: res.data, isLoading: false })
    } catch (e) {
      console.error('Failed to load sessions:', e)
      set({ isLoading: false })
    }
  },
  loadTransactions: async (sessionId) => {
    set({ isLoading: true })
    try {
      const res = await getTransactions(sessionId)
      set({ transactions: res.data, isLoading: false })
    } catch (e) {
      console.error('Failed to load transactions:', e)
      set({ isLoading: false })
    }
  },
  loadTagSummary: async (sessionId) => {
    try {
      const res = await getTagSummary(sessionId)
      set({ tagSummary: res.data })
    } catch (e) {
      console.error('Failed to load tag summary:', e)
    }
  },
  setCurrentSession: (session) => {
    set({
      currentSession: session,
      ...(session ? {} : { transactions: [], tagSummary: null })
    })
    if (session) {
      get().loadTransactions(session.id)
      get().loadTagSummary(session.id)
    }
  },
  processFiles: async (pdfFiles, clientList, threshold, options) => {
    const progressId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    set({
      isProcessing: true,
      processingError: null,
      processingProgress: {
        id: progressId,
        percent: 0,
        message: 'Starting audit...',
        stage: 'queued'
      }
    })

    // --- SSE subscription (push instead of polling) ---
    // Wrap in ref object so TS doesn't narrow to 'never' after async assignment
    const sse = { source: null as EventSource | null }
    const startSse = async () => {
      try {
        const { getBackendPort, getBackendConfig } = window.electronAPI ?? {}
        let port = 8765
        let token = ''
        if (getBackendConfig) {
          const cfg = await getBackendConfig()
          port = cfg.port
          token = cfg.token
        } else if (getBackendPort) {
          port = await getBackendPort()
        }
        const url = `http://127.0.0.1:${port}/transactions/parse-progress/${progressId}/stream${token ? `?token=${token}` : ''}`
        sse.source = new EventSource(url)
        sse.source.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data)
            set({ processingProgress: data })
          } catch {}
        }
        sse.source.onerror = () => {
          // SSE error — fall back silently (final state will be set after parse resolves)
          sse.source?.close()
          sse.source = null
        }
      } catch {
        // SSE not available (dev env without electron) — will rely on final state set below
      }
    }
    startSse()

    try {
      const pdfArr = Array.isArray(pdfFiles) ? pdfFiles : [pdfFiles]
      const res = await parseFiles(pdfArr, clientList, threshold, { ...options, progressId })
      const sessionId = res.data.session_id
      sse.source?.close()
      await get().loadSessions()
      const session = get().sessions.find((s) => s.id === sessionId)
      if (session) {
        get().setCurrentSession(session)
      }
      set((state) => ({
        isProcessing: false,
        processingProgress: state.processingProgress
          ? { ...state.processingProgress, percent: 100, stage: 'complete', message: 'Audit ready.' }
          : null
      }))
      return sessionId
    } catch (e: unknown) {
      console.error('Failed to process files:', e)
      sse.source?.close()
      let msg = 'Processing failed. Check the PDF is valid and not encrypted.'
      if (e && typeof e === 'object') {
        const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
        const message = (e as { message?: string }).message
        if (detail) msg = detail
        else if (message) msg = message
      }
      set((state) => ({
        isProcessing: false,
        processingError: msg,
        processingProgress: state.processingProgress
          ? { ...state.processingProgress, stage: 'error', message: msg }
          : null
      }))
      return null
    }
  },
  deleteSession: async (sessionId) => {
    await deleteSessionApi(sessionId)
    await get().loadSessions()
    const current = get().currentSession
    if (current?.id === sessionId) {
      set({ currentSession: null, transactions: [], tagSummary: null })
    }
  },
  refreshCurrentSession: async () => {
    const current = get().currentSession
    if (current) {
      set({ isLoading: true })
      try {
        const [txRes, summaryRes] = await Promise.all([
          getTransactions(current.id),
          getTagSummary(current.id)
        ])
        set({ transactions: txRes.data, tagSummary: summaryRes.data, isLoading: false })
      } catch (e) {
        console.error('Failed to refresh session:', e)
        set({ isLoading: false })
      }
    }
  }
}))
