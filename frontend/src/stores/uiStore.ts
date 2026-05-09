import { create } from 'zustand'

type ResultFilter = 'all' | 'client' | 'broker' | 'suspicious'

interface Toast {
  id: number
  message: string
  action?: { label: string; onClick: () => void }
}

interface UIState {
  sidebarOpen: boolean
  settingsOpen: boolean
  exportOpen: boolean
  passwordDialogOpen: boolean
  showNewAudit: boolean
  selectedTransactionIds: number[]
  searchQuery: string
  filterTags: string[]
  resultFilter: ResultFilter
  minAmount: number | null
  maxAmount: number | null
  toasts: Toast[]
  pushToast: (toast: Omit<Toast, 'id'>) => void
  popToast: (id: number) => void
  toggleSidebar: () => void
  toggleSettings: () => void
  toggleExport: () => void
  togglePasswordDialog: () => void
  setShowNewAudit: (show: boolean) => void
  goHome: () => void
  selectTransaction: (id: number, multi?: boolean) => void
  clearSelection: () => void
  setSearchQuery: (q: string) => void
  setFilterTags: (tags: string[]) => void
  setResultFilter: (filter: ResultFilter) => void
  setAmountRange: (min: number | null, max: number | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  settingsOpen: false,
  exportOpen: false,
  passwordDialogOpen: false,
  showNewAudit: false,
  selectedTransactionIds: [],
  searchQuery: '',
  filterTags: [],
  resultFilter: 'all',
  minAmount: null,
  maxAmount: null,
  toasts: [],
  pushToast: (toast) => {
    const id = Date.now()
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000)
  },
  popToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  toggleExport: () => set((s) => ({ exportOpen: !s.exportOpen })),
  togglePasswordDialog: () => set((s) => ({ passwordDialogOpen: !s.passwordDialogOpen })),
  setShowNewAudit: (show) => set({ showNewAudit: show }),
  goHome: () => set({ showNewAudit: false, selectedTransactionIds: [], searchQuery: '', filterTags: [], resultFilter: 'all', minAmount: null, maxAmount: null }),
  selectTransaction: (id, multi) => set((s) => {
    if (multi) {
      const exists = s.selectedTransactionIds.includes(id)
      return {
        selectedTransactionIds: exists
          ? s.selectedTransactionIds.filter((x) => x !== id)
          : [...s.selectedTransactionIds, id]
      }
    }
    return { selectedTransactionIds: [id] }
  }),
  clearSelection: () => set({ selectedTransactionIds: [] }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterTags: (tags) => set({ filterTags: tags }),
  setResultFilter: (filter) => set({ resultFilter: filter }),
  setAmountRange: (min, max) => set({ minAmount: min, maxAmount: max })
}))
