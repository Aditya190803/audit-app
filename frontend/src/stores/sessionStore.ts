import { create } from 'zustand'
import type { Transaction, AuditSession, TagSummary } from '../types/api'

interface SessionState {
  sessions: AuditSession[]
  currentSession: AuditSession | null
  transactions: Transaction[]
  tagSummary: TagSummary | null
  isLoading: boolean
  isProcessing: boolean
  loadSessions: () => Promise<void>
  loadTransactions: (sessionId: number) => Promise<void>
  loadTagSummary: (sessionId: number) => Promise<void>
  setCurrentSession: (session: AuditSession | null) => void
  processFiles: (
    pdf: File,
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
  loadSessions: async () => {
    set({ isLoading: true })
    try {
      const { getSessions } = await import('../lib/api')
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
      const { getTransactions } = await import('../lib/api')
      const res = await getTransactions(sessionId)
      set({ transactions: res.data, isLoading: false })
    } catch (e) {
      console.error('Failed to load transactions:', e)
      set({ isLoading: false })
    }
  },
  loadTagSummary: async (sessionId) => {
    try {
      const { getTagSummary } = await import('../lib/api')
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
  processFiles: async (pdf, clientList, threshold, options) => {
    set({ isProcessing: true })
    try {
      const { parseFiles } = await import('../lib/api')
      const res = await parseFiles(pdf, clientList, threshold, options)
      const sessionId = res.data.session_id
      await get().loadSessions()
      const session = get().sessions.find((s) => s.id === sessionId)
      if (session) {
        get().setCurrentSession(session)
      }
      set({ isProcessing: false })
      return sessionId
    } catch (e) {
      console.error('Failed to process files:', e)
      set({ isProcessing: false })
      return null
    }
  },
  deleteSession: async (sessionId) => {
    const { deleteSession } = await import('../lib/api')
    await deleteSession(sessionId)
    await get().loadSessions()
    const current = get().currentSession
    if (current?.id === sessionId) {
      set({ currentSession: null, transactions: [], tagSummary: null })
    }
  },
  refreshCurrentSession: async () => {
    const current = get().currentSession
    if (current) {
      await get().loadTransactions(current.id)
      await get().loadTagSummary(current.id)
    }
  }
}))
