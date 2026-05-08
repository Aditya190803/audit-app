import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Settings,
  Download,
  FileText,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
  Users,
  Building2,
  AlertTriangle,
  LayoutList
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { FileDropZone } from './FileDropZone'
import { DataTable } from './DataTable'
import { SearchFilters } from './SearchFilters'
import { SettingsPanel } from './SettingsPanel'
import { ExportPanel } from './ExportPanel'
import { PDFPreview } from './PDFPreview'
import { KeyboardShortcuts } from './KeyboardShortcuts'

type ResultFilter = 'all' | 'client' | 'broker' | 'suspicious'

const RESULT_FILTER_META: { key: ResultFilter; label: string; icon: React.ReactNode; colorVar: string; bgVar: string }[] = [
  { key: 'all', label: 'All', icon: <LayoutList className="h-3.5 w-3.5" strokeWidth={2} />, colorVar: 'var(--text-primary)', bgVar: 'var(--surface-hover)' },
  { key: 'client', label: 'Client', icon: <Users className="h-3.5 w-3.5" strokeWidth={2} />, colorVar: 'var(--success)', bgVar: 'var(--success-subtle)' },
  { key: 'broker', label: 'Broker', icon: <Building2 className="h-3.5 w-3.5" strokeWidth={2} />, colorVar: 'var(--warning)', bgVar: 'var(--warning-subtle)' },
  { key: 'suspicious', label: 'Suspicious', icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />, colorVar: 'var(--danger)', bgVar: 'var(--danger-subtle)' },
]

export const AppShell: React.FC = () => {
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [currentPdfPage, setCurrentPdfPage] = useState(1)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: number } | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const {
    sidebarOpen,
    settingsOpen,
    exportOpen,
    selectedTransactionIds,
    searchQuery,
    filterTags,
    resultFilter,
    minAmount,
    maxAmount,
    toggleSidebar,
    toggleSettings,
    toggleExport,
    goHome,
    selectTransaction,
    clearSelection,
    setSearchQuery,
    setFilterTags,
    setResultFilter,
  } = useUIStore()

  const {
    sessions,
    currentSession,
    transactions,
    tagSummary,
    isLoading,
    isProcessing,
    loadSessions,
    setCurrentSession,
    processFiles,
    deleteSession,
    refreshCurrentSession
  } = useSessionStore()

  const { settings, loadSettings } = useSettingsStore()
  const brokers = (settings.broker_list as string[]) || []

  useEffect(() => {
    loadSessions()
    loadSettings()
  }, [loadSessions, loadSettings])

  // Compute filter tags for DataTable based on result filter
  const effectiveFilterTags = useMemo(() => {
    if (resultFilter === 'all') return filterTags
    return [resultFilter, ...filterTags.filter((t) => t !== resultFilter)]
  }, [resultFilter, filterTags])

  // Count transactions per result filter from current view
  const filterCounts = useMemo(() => {
    const counts = { all: transactions.length, client: 0, broker: 0, suspicious: 0 }
    for (const tx of transactions) {
      const tag = tx.tags[0]?.tag_type
      if (tag === 'client') counts.client++
      if (tag === 'broker') counts.broker++
      if (tag === 'suspicious') counts.suspicious++
    }
    return counts
  }, [transactions])

  useEffect(() => {
    if (!contextMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu, closeContextMenu])

  const handleContextDelete = async () => {
    if (!contextMenu) return
    setDeleteConfirmId(contextMenu.sessionId)
    closeContextMenu()
  }

  const confirmDelete = async (sessionId: number) => {
    await deleteSession(sessionId)
    setDeleteConfirmId(null)
  }

  const handleGoHome = useCallback(() => {
    goHome()
    setCurrentSession(null)
  }, [goHome, setCurrentSession])

  const handleNewAudit = useCallback(() => {
    handleGoHome()
  }, [handleGoHome])

  const handleFilesSelected = async (
    pdf: File,
    clientList: File,
    threshold: number,
    options: {
      password?: string
      sheetName?: string
      nameColumn?: string
      excludedBrokers?: string[]
      apCodes?: string[]
      bankName?: string
    }
  ) => {
    const sessionId = await processFiles(pdf, clientList, threshold, options)
    if (sessionId) {
      await loadSessions()
      const session = sessions.find((s) => s.id === sessionId)
      if (session) {
        setCurrentSession(session)
      }
    }
  }

  const handleRemoveTag = async (tagId: number) => {
    const { removeTag } = await import('../lib/api')
    await removeTag(tagId)
    await refreshCurrentSession()
  }

  const handleAddTag = async (transactionId: number, tagType: string) => {
    const { getTags, addTag, bulkRemoveTags } = await import('../lib/api')
    // Single tag only: remove existing tags first
    const existing = await getTags(transactionId)
    const existingIds = existing.data.map((t) => t.id)
    if (existingIds.length > 0) {
      await bulkRemoveTags(existingIds)
    }
    await addTag(transactionId, tagType)
    await refreshCurrentSession()
  }

  const handleSelectTransaction = (id: number, multi?: boolean) => {
    selectTransaction(id, multi)
    const tx = transactions.find((t) => t.id === id)
    if (tx?.page_number) {
      setCurrentPdfPage(tx.page_number)
    }
  }

  return (
    <div className="h-full flex bg-[var(--bg)]">
      <KeyboardShortcuts />

      {/* Sidebar */}
      <aside
        className={`shrink-0 bg-[var(--surface)] border-r border-[var(--border)] flex flex-col transition-[width] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
          sidebarOpen ? 'w-[var(--sidebar-width)]' : 'w-0 overflow-hidden'
        }`}
      >
        {/* Brand */}
        <button onClick={handleGoHome} className="h-[var(--header-height)] px-4 flex items-center gap-2.5 border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors duration-150 w-full text-left">
          <div className="h-7 w-7 rounded-[var(--radius-md)] bg-[var(--navy-brand)] flex items-center justify-center shrink-0">
            <span className="text-[10px] font-semibold text-white tracking-wide">SKA</span>
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">Bank Audit</span>
            <span className="text-[10px] text-[var(--text-tertiary)] mt-0.5">Shah Kapadia &amp; Associates</span>
          </div>
        </button>

        <div className="p-2 border-b border-[var(--border)]">
          <button
            onClick={handleNewAudit}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary-subtle)] rounded-[var(--radius-md)] transition-colors duration-150"
          >
            <svg className="h-4 w-4" strokeWidth={2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Audit
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          <div className="px-3 py-1.5">
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
              Sessions
            </span>
          </div>

          <div className="px-2 space-y-0.5">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setCurrentSession(session)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id })
                }}
                className={`w-full text-left px-3 py-2 rounded-[var(--radius-md)] text-sm transition-colors duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                  currentSession?.id === session.id
                    ? 'bg-[var(--primary-subtle)] text-[var(--primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 flex-shrink-0 opacity-60" strokeWidth={2} />
                  <span className="truncate font-medium">{session.name || `Session ${session.id}`}</span>
                </div>
                <div className="text-[11px] opacity-50 mt-0.5 pl-5">
                  {new Date(session.created_at).toLocaleDateString()}
                </div>
              </button>
            ))}
          </div>

          {sessions.length === 0 && (
            <div className="px-4 py-3 text-xs text-[var(--text-tertiary)]">
              No sessions yet
            </div>
          )}
        </div>

        <div className="p-2 border-t border-[var(--border)]">
          <button
            onClick={toggleSettings}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] rounded-[var(--radius-md)] transition-colors duration-150"
          >
            <Settings className="h-4 w-4" strokeWidth={1.5} />
            Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-[var(--header-height)] bg-[var(--surface)] border-b border-[var(--border)] px-3 flex items-center gap-3 shrink-0">
          <button
            onClick={toggleSidebar}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors duration-150"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <ChevronLeft className="h-4 w-4" strokeWidth={2} /> : <ChevronRight className="h-4 w-4" strokeWidth={2} />}
          </button>

          {currentSession ? (
            <>
              <h2 className="text-sm font-semibold text-[var(--text-primary)] truncate">
                {currentSession.name || `Session ${currentSession.id}`}
              </h2>
              <div className="flex-1" />

              {tagSummary && (
                <div className="flex items-center gap-1.5">
                  <span className="tag-client">
                    {tagSummary.client} client
                  </span>
                  <span className="tag-broker">
                    {tagSummary.broker} broker
                  </span>
                  <span className="tag-suspicious">
                    {tagSummary.suspicious} suspicious
                  </span>
                </div>
              )}

              {selectedTransactionIds.length > 0 && (
                <div className="flex items-center gap-2 px-2.5 py-1 bg-[var(--primary-subtle)] rounded-[var(--radius-md)] border border-[var(--primary)]/10">
                  <span className="text-xs font-medium text-[var(--primary)]">
                    {selectedTransactionIds.length} selected
                  </span>
                  <button
                    onClick={clearSelection}
                    className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                  >
                    <X className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              )}

              {currentSession?.pdf_path && (
                <button
                  onClick={() => setPdfPreviewOpen(!pdfPreviewOpen)}
                  className={`btn-ghost ${pdfPreviewOpen ? 'text-[var(--primary)] bg-[var(--primary-subtle)]' : ''}`}
                  title="Toggle PDF preview"
                >
                  <Eye className="h-4 w-4" strokeWidth={1.5} />
                </button>
              )}

              <button onClick={toggleExport} className="btn-secondary flex items-center gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" strokeWidth={2} />
                Export
              </button>

            </>
          ) : (
            <div className="flex-1" />
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {!currentSession ? (
            <div className="h-full overflow-auto">
              <div className="max-w-2xl mx-auto px-8 py-10">
                <h1 className="text-xl font-semibold text-[var(--text-primary)]">Start New Audit</h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 mb-8">
                  Upload a bank statement and a client list. Set a threshold to flag suspicious transactions for this audit.
                </p>
                <FileDropZone onFilesSelected={handleFilesSelected} isProcessing={isProcessing} brokers={brokers} />
              </div>
            </div>
          ) : (
            <div className="h-full flex">
              <div className={`flex-1 flex flex-col min-w-0 ${pdfPreviewOpen ? 'w-3/5' : 'w-full'}`}>
                <SearchFilters
                  searchQuery={searchQuery}
                  filterTags={filterTags}
                  onSearchChange={setSearchQuery}
                  onFilterTagsChange={setFilterTags}
                />

                {/* Result Filter Tabs */}
                <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--surface)] flex items-center gap-2">
                  {RESULT_FILTER_META.map((meta) => {
                    const isActive = resultFilter === meta.key
                    const count = filterCounts[meta.key]
                    return (
                      <button
                        key={meta.key}
                        onClick={() => setResultFilter(meta.key)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors duration-150 ${
                          isActive
                            ? `bg-[${meta.bgVar}] text-[${meta.colorVar}] border-current`
                            : 'bg-white border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
                        }`}
                        style={isActive ? { backgroundColor: meta.bgVar, color: meta.colorVar, borderColor: meta.colorVar + '40' } : undefined}
                      >
                        {meta.icon}
                        {meta.label}
                        <span className={`ml-0.5 text-[10px] px-1 py-0 rounded-full ${isActive ? 'bg-current/10' : 'bg-[var(--bg)] text-[var(--text-tertiary)]'}`} style={isActive ? { color: meta.colorVar } : undefined}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {isLoading ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--border-strong)] border-t-[var(--primary)]" />
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto">
                    <DataTable
                      transactions={transactions}
                      selectedIds={selectedTransactionIds}
                      onSelectTransaction={handleSelectTransaction}
                      onRemoveTag={handleRemoveTag}
                      onAddTag={handleAddTag}
                      searchQuery={searchQuery}
                      filterTags={effectiveFilterTags}
                      minAmount={minAmount}
                      maxAmount={maxAmount}
                    />
                  </div>
                )}
              </div>
              {pdfPreviewOpen && currentSession?.pdf_path && (
                <div className="w-2/5 border-l border-[var(--border)] bg-[var(--bg)]">
                  <PDFPreview
                    pdfPath={currentSession.pdf_path}
                    currentPage={currentPdfPage}
                    onPageChange={setCurrentPdfPage}
                    onClose={() => setPdfPreviewOpen(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            ref={menuRef}
            className="fixed z-50 min-w-[140px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-lg py-1"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleContextDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[var(--danger-subtle)] transition-colors text-left"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
              Delete
            </button>
          </div>
        </>
      )}

      {deleteConfirmId && (
        <>
          <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setDeleteConfirmId(null)} />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-xl p-5 w-80">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Delete session?</h3>
            <p className="text-xs text-[var(--text-secondary)] mt-1">Are you sure you want to delete this session? This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteConfirmId(null)} className="btn-ghost text-xs">Cancel</button>
              <button onClick={() => confirmDelete(deleteConfirmId)} className="btn-danger text-xs">Delete</button>
            </div>
          </div>
        </>
      )}

      <SettingsPanel isOpen={settingsOpen} onClose={toggleSettings} />
      <ExportPanel isOpen={exportOpen} onClose={toggleExport} sessionId={currentSession?.id || null} />
    </div>
  )
}


