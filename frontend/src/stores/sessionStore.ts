import { create } from 'zustand'
import { deleteSession as deleteSessionApi, getParseProgress, getSessions, getTagSummary, getTransactions, parseFiles } from '../lib/api'
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
      excludedBrokers?: string[]
      apCodes?: string[]
      bankName?: string
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
    set({ currentSession: session })
    if (session) {
      get().loadTransactions(session.id)
      get().loadTagSummary(session.id)
    }
  },
  processFiles: async (pdfFiles, clientList, threshold, options) => {
    const progressId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const pollProgress = async () => {
      try {
        const progress = await getParseProgress(progressId)
        set({ processingProgress: progress.data })
      } catch (e) {
        console.error('Failed to poll audit progress:', e)
      }
    }

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
    pollTimer = setInterval(pollProgress, 750)
    try {
      const pdfArr = Array.isArray(pdfFiles) ? pdfFiles : [pdfFiles]
      const res = await parseFiles(pdfArr, clientList, threshold, { ...options, progressId })
      const sessionId = res.data.session_id
      await pollProgress()
      await get().loadSessions()
      const session = get().sessions.find((s) => s.id === sessionId)
      if (session) {
        get().setCurrentSession(session)
      }
      if (pollTimer) clearInterval(pollTimer)
      set((state) => ({
        isProcessing: false,
        processingProgress: state.processingProgress
          ? { ...state.processingProgress, percent: 100, stage: 'complete', message: 'Audit ready.' }
          : null
      }))
      return sessionId
    } catch (e: any) {
      console.error('Failed to process files:', e)
      if (pollTimer) clearInterval(pollTimer)
      const msg = e?.response?.data?.detail || e?.message || 'Processing failed. Check the PDF is valid and not encrypted.'
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
