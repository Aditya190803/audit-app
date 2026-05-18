import { create } from 'zustand'
import type { AdvancedFilters, ReviewView } from '../utils/auditAnalytics'
import { DEFAULT_ADVANCED_FILTERS } from '../utils/auditAnalytics'

type ResultFilter = 'all' | 'client' | 'broker' | 'suspicious'
type ContextPanelMode = 'review' | 'pdf'

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
  reviewView: ReviewView
  advancedFilters: AdvancedFilters
  filtersExpanded: boolean
  toasts: Toast[]
  // Right panel state
  contextPanelOpen: boolean
  contextPanelMode: ContextPanelMode
  pushToast: (toast: Omit<Toast, 'id'>) => void
  popToast: (id: number) => void
  toggleSidebar: () => void
  toggleSettings: () => void
  toggleExport: () => void
  togglePasswordDialog: () => void
  closeModals: () => void
  setShowNewAudit: (show: boolean) => void
  goHome: () => void
  selectTransaction: (id: number, multi?: boolean) => void
  clearSelection: () => void
  setSearchQuery: (q: string) => void
  setFilterTags: (tags: string[]) => void
  setResultFilter: (filter: ResultFilter) => void
  setAmountRange: (min: number | null, max: number | null) => void
  setReviewView: (view: ReviewView) => void
  setAdvancedFilter: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
  resetAdvancedFilters: () => void
  toggleFiltersExpanded: () => void
  activeFilterCount: () => number
  toggleContextPanel: () => void
  setContextPanelMode: (mode: ContextPanelMode) => void
  setContextPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set, get) => ({
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
  reviewView: 'dashboard',
  advancedFilters: DEFAULT_ADVANCED_FILTERS,
  filtersExpanded: false,
  toasts: [],
  contextPanelOpen: true,
  contextPanelMode: 'review',
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
  closeModals: () => set({ settingsOpen: false, exportOpen: false, passwordDialogOpen: false }),
  setShowNewAudit: (show) => set({ showNewAudit: show }),
  goHome: () => set({
    showNewAudit: false,
    selectedTransactionIds: [],
    searchQuery: '',
    filterTags: [],
    resultFilter: 'all',
    minAmount: null,
    maxAmount: null,
    reviewView: 'dashboard',
    advancedFilters: DEFAULT_ADVANCED_FILTERS,
    filtersExpanded: false,
    contextPanelOpen: true,
    contextPanelMode: 'review',
  }),
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
  setAmountRange: (min, max) => set({ minAmount: min, maxAmount: max }),
  setReviewView: (view) => set({ reviewView: view }),
  setAdvancedFilter: (key, value) => set((state) => ({ advancedFilters: { ...state.advancedFilters, [key]: value } })),
  resetAdvancedFilters: () => set({
    advancedFilters: DEFAULT_ADVANCED_FILTERS,
    minAmount: null,
    maxAmount: null,
    searchQuery: '',
    filterTags: [],
    resultFilter: 'all',
  }),
  toggleFiltersExpanded: () => set((s) => ({ filtersExpanded: !s.filtersExpanded })),
  activeFilterCount: () => {
    const { advancedFilters, searchQuery, filterTags } = get()
    let count = 0
    if (searchQuery) count++
    if (filterTags.length > 0) count++
    const entries = Object.entries(advancedFilters) as [keyof AdvancedFilters, unknown][]
    for (const [key, value] of entries) {
      const defaults = DEFAULT_ADVANCED_FILTERS
      if (value !== defaults[key]) count++
    }
    return count
  },
  toggleContextPanel: () => set((s) => ({ contextPanelOpen: !s.contextPanelOpen })),
  setContextPanelMode: (mode) => set({ contextPanelMode: mode }),
  setContextPanelOpen: (open) => set({ contextPanelOpen: open }),
}))
