import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Plus, FileText, Search, Settings, Download,
  Trash2, MoreHorizontal, Clock, ArrowRight, PanelLeft,
  Table2, BarChart3, AlertTriangle,
  Edit3, Check, X, Loader2,
} from 'lucide-react'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuditAnalyticsWorker } from '../hooks/useAuditAnalyticsWorker'
import { EMPTY_AUDIT_ANALYTICS } from '../utils/auditAnalytics'
import type { AdvancedFilters } from '../utils/auditAnalytics'
import type { AuditSession } from '../types/api'
import { deleteSession, renameSession } from '../lib/api'

import { FileDropZone } from './FileDropZone'
import { DataTable } from './DataTable'
import { SearchFilters } from './SearchFilters'
import { AuditReviewPage } from './AuditReviewPage'
import { SettingsPanel } from './SettingsPanel'
import { ExportPanel } from './ExportPanel'
import { ToastContainer } from './Toast'
import { KeyboardShortcuts } from './KeyboardShortcuts'

/* ════════════════════════════════════════════════════════════════════════════
   APP SHELL — The main orchestrator
   ════════════════════════════════════════════════════════════════════════════ */

export function AppShell() {
  const {
    sessions, currentSession, transactions, isLoading,
    loadSessions, setCurrentSession,
  } = useSessionStore()

  const {
    sidebarOpen, settingsOpen, exportOpen, showNewAudit,
    searchQuery, filterTags, resultFilter, advancedFilters, filtersExpanded,
    reviewView,
    toggleSidebar, toggleSettings, toggleExport,
    setShowNewAudit, goHome, setSearchQuery,
    setResultFilter, setAdvancedFilter,
    toggleFiltersExpanded, setReviewView, activeFilterCount,
  } = useUIStore()

  const settings = useSettingsStore((s) => s.settings)
  const suspiciousThreshold = (settings.suspicious_threshold as number) || 10000

  // Effective filter tags from resultFilter + manual filterTags
  const effectiveFilterTags = useMemo(() => {
    if (resultFilter === 'all') return filterTags
    if (filterTags.includes(resultFilter)) return filterTags
    return [...filterTags, resultFilter]
  }, [filterTags, resultFilter])

  // Analytics via web worker
  const { data: analytics, isComputing } = useAuditAnalyticsWorker(
    transactions,
    searchQuery,
    effectiveFilterTags,
    advancedFilters,
    suspiciousThreshold,
    EMPTY_AUDIT_ANALYTICS,
  )
  const resolvedAnalytics = analytics ?? EMPTY_AUDIT_ANALYTICS

  // Load sessions on mount
  useEffect(() => { loadSessions() }, [loadSessions])

  // Active view
  const [activeView, setActiveView] = useState<'data' | 'review'>('data')

  // Handle exception filter from review page
  const handleExceptionFilter = useCallback((key: string, value: string) => {
    if (key === 'exception') {
      setAdvancedFilter('exception', value as AdvancedFilters['exception'])
    } else if (key === 'resultFilter') {
      setResultFilter(value as any)
    } else if (key === 'partyName') {
      setAdvancedFilter('partyName', value)
    } else if (key === 'clientName') {
      setAdvancedFilter('clientName', value)
    } else if (key === 'brokerName') {
      setAdvancedFilter('brokerName', value)
    }
    setActiveView('data')
  }, [setAdvancedFilter, setResultFilter])

  // When user selects a session
  const handleSessionSelect = (session: AuditSession) => {
    setCurrentSession(session)
    setShowNewAudit(false)
    setActiveView('data')
  }

  const handleNewAudit = useCallback(() => {
    setCurrentSession(null)
    goHome()
    setShowNewAudit(true)
    setActiveView('data')
  }, [goHome, setCurrentSession, setShowNewAudit])

  const hasSession = currentSession !== null
  const showEmptyState = !hasSession && !showNewAudit

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg)]">
      <div className="flex flex-1 min-h-0">
        {/* ── Sidebar ─────────────────────────────────────── */}
        <Sidebar
          sessions={sessions}
          currentSession={currentSession}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          onSessionSelect={handleSessionSelect}
          onNewAudit={handleNewAudit}
          onSettings={toggleSettings}
          onLoadSessions={loadSessions}
        />

        {/* ── Main content area ────────────────────────────── */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top toolbar */}
          {hasSession && (
            <Toolbar
              session={currentSession!}
              activeView={activeView}
              onViewChange={setActiveView}
              onExport={toggleExport}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterCount={activeFilterCount()}
              onToggleFilters={toggleFiltersExpanded}
              isComputing={isComputing}
            />
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 flex">
            <div className="flex-1 min-w-0 flex flex-col min-h-0">
              {showEmptyState && (
                <WelcomeScreen
                  sessions={sessions}
                  onSessionSelect={handleSessionSelect}
                  onNewAudit={handleNewAudit}
                />
              )}

              {showNewAudit && !hasSession && (
                <div className="flex-1 min-h-0 overflow-y-auto p-6 animate-fade-in-up">
                  <div className="min-h-full flex justify-center py-8">
                    <div className="my-auto w-full max-w-4xl">
                      <FileDropZone />
                    </div>
                  </div>
                </div>
              )}

              {hasSession && activeView === 'data' && (
                <>
                  {filtersExpanded && (
                    <div className="shrink-0 animate-fade-in-down">
                      <SearchFilters
                        analytics={resolvedAnalytics}
                        transactions={transactions}
                      />
                    </div>
                  )}
                  <div className="flex-1 min-h-0 flex overflow-hidden">
                    <DataTable
                      analytics={resolvedAnalytics}
                      isLoading={isLoading}
                    />
                  </div>
                </>
              )}

              {hasSession && activeView === 'review' && (
                <div className="flex-1 min-h-0 overflow-hidden">
                  <AuditReviewPage
                    analytics={resolvedAnalytics}
                    activeTab={reviewView}
                    suspiciousThreshold={suspiciousThreshold}
                    onTabChange={setReviewView}
                    onExceptionFilter={handleExceptionFilter}
                  />
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Modals */}
      <SettingsPanel isOpen={settingsOpen} onClose={toggleSettings} />
      <ExportPanel
        isOpen={exportOpen}
        onClose={toggleExport}
        sessionId={currentSession?.id ?? null}
      />
      <ToastContainer />
      <KeyboardShortcuts />
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════════════════
   SIDEBAR
   ════════════════════════════════════════════════════════════════════════════ */

function Sidebar({
  sessions,
  currentSession,
  isOpen,
  onToggle,
  onSessionSelect,
  onNewAudit,
  onSettings,
  onLoadSessions,
}: {
  sessions: AuditSession[]
  currentSession: AuditSession | null
  isOpen: boolean
  onToggle: () => void
  onSessionSelect: (s: AuditSession) => void
  onNewAudit: () => void
  onSettings: () => void
  onLoadSessions: () => Promise<void>
}) {
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null)
  const contextRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  const handleRename = async (id: number) => {
    if (renameValue.trim()) {
      await renameSession(id, renameValue.trim())
      await onLoadSessions()
    }
    setRenaming(null)
    setRenameValue('')
  }

  const handleDelete = async (id: number) => {
    if (confirm('Delete this audit session? This cannot be undone.')) {
      await deleteSession(id)
      await onLoadSessions()
    }
    setContextMenu(null)
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  if (!isOpen) {
    return (
      <div className="w-[var(--sidebar-collapsed)] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col items-center py-3 gap-2 shrink-0">
        <button
          onClick={onToggle}
          className="btn-icon"
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="w-8 h-px bg-[var(--border)] my-1" />
        <button onClick={onNewAudit} className="btn-icon" title="New audit">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="flex-1" />
        <button onClick={onSettings} className="btn-icon" title="Settings">
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="w-[var(--sidebar-width)] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0 animate-slide-in-left"
      style={{ animationDuration: '0.15s' }}
    >
      {/* Sidebar header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Sessions</span>
        <div className="flex items-center gap-1">
          <button onClick={onNewAudit} className="btn-icon p-1.5" title="New audit">
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button onClick={onToggle} className="btn-icon p-1.5" title="Collapse sidebar">
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {sorted.length === 0 && (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 mx-auto text-[var(--border-strong)] mb-2" strokeWidth={1} />
            <p className="text-xs text-[var(--text-tertiary)]">No audit sessions yet</p>
            <button onClick={onNewAudit} className="mt-3 btn-primary text-xs py-1.5 px-3">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Start audit
            </button>
          </div>
        )}

        {sorted.map((session) => {
          const isActive = currentSession?.id === session.id
          const isRenaming = renaming === session.id

          return (
            <div
              key={session.id}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              className={`
                group relative flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)]
                cursor-pointer select-none transition-all duration-150
                ${isActive
                  ? 'bg-[var(--primary-bg)] border border-[var(--primary)]/20 text-[var(--primary)]'
                  : 'hover:bg-[var(--surface-hover)] text-[var(--text-primary)]'
                }
              `}
              onClick={() => !isRenaming && onSessionSelect(session)}
            >
              <div className={`shrink-0 p-1 rounded-md ${isActive ? 'bg-[var(--primary-subtle)]' : 'bg-[var(--surface-inset)]'}`}>
                <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(session.id); if (e.key === 'Escape') setRenaming(null) }}
                      className="input-field text-xs py-0.5 px-1.5"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleRename(session.id) }} className="btn-icon p-0.5">
                      <Check className="h-3 w-3" strokeWidth={2} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRenaming(null) }} className="btn-icon p-0.5">
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-medium truncate">
                      {session.name || `Audit #${session.id}`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                        {new Date(session.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, session.id) }}
                className="opacity-0 group-hover:opacity-100 btn-icon p-1 shrink-0 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Sidebar footer */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
        <button onClick={onSettings} className="btn-ghost text-xs w-full justify-start py-2">
          <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
          Settings
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 card shadow-[var(--shadow-lg)] py-1 min-w-[160px] animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const s = sessions.find((s) => s.id === contextMenu.id)
              setRenameValue(s?.name || '')
              setRenaming(contextMenu.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Rename
          </button>
          <button
            onClick={() => handleDelete(contextMenu.id)}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Delete
          </button>
        </div>
      )}
    </div>
  )
}


/* ════════════════════════════════════════════════════════════════════════════
   TOOLBAR
   ════════════════════════════════════════════════════════════════════════════ */

function Toolbar({
  session,
  activeView,
  onViewChange,
  onExport,
  searchQuery,
  onSearchChange,
  filterCount,
  onToggleFilters,
  isComputing,
}: {
  session: AuditSession
  activeView: 'data' | 'review'
  onViewChange: (v: 'data' | 'review') => void
  onExport: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  filterCount: number
  onToggleFilters: () => void
  isComputing: boolean
}) {
  return (
    <div className="h-[var(--header-height)] bg-[var(--surface)] border-b border-[var(--border)] px-4 flex items-center gap-3 shrink-0">
      {/* View switcher */}
      <div className="flex items-center bg-[var(--bg-raised)] rounded-[var(--radius-lg)] p-0.5 border border-[var(--border-subtle)]">
        <ViewTab
          active={activeView === 'data'}
          onClick={() => onViewChange('data')}
          icon={<Table2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Transactions"
        />
        <ViewTab
          active={activeView === 'review'}
          onClick={() => onViewChange('review')}
          icon={<BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Review"
        />
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Search */}
      {activeView === 'data' && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={2} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transactions..."
            className="input-field pl-9 py-1.5 text-[13px] bg-[var(--bg)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-icon p-0.5"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {activeView === 'data' && (
        <button
          onClick={onToggleFilters}
          className={`btn-secondary text-xs py-1.5 ${filterCount > 0 ? 'border-[var(--primary)]/30 text-[var(--primary)]' : ''}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
          Filters
          {filterCount > 0 && (
            <span className="badge badge-primary text-[10px] ml-1 py-0 px-1.5">{filterCount}</span>
          )}
        </button>
      )}

      <div className="flex-1" />

      {/* Session info */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        {isComputing && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" strokeWidth={2} />}
        <span className="font-medium text-[var(--text-secondary)] truncate max-w-[200px]">
          {session.name || `Audit #${session.id}`}
        </span>
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button onClick={onExport} className="btn-icon p-2" title="Export">
          <Download className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)]
        transition-all duration-150
        ${active
          ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-xs)] ring-1 ring-[var(--border)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        }
      `}
    >
      {icon}
      {label}
    </button>
  )
}


/* ════════════════════════════════════════════════════════════════════════════
   WELCOME SCREEN
   ════════════════════════════════════════════════════════════════════════════ */

function WelcomeScreen({
  sessions,
  onSessionSelect,
  onNewAudit,
}: {
  sessions: AuditSession[]
  onSessionSelect: (s: AuditSession) => void
  onNewAudit: () => void
}) {
  const recent = [...sessions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <div className="text-center max-w-lg">
        {/* Hero */}
        <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto leading-relaxed">
          Upload bank statements and client lists to begin. The system will automatically parse, match, and flag transactions for review.
        </p>

        <button onClick={onNewAudit} className="btn-primary text-sm px-6 py-2.5 mb-8">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Start New Audit
        </button>

        {/* Recent sessions */}
        {recent.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Recent sessions
            </p>
            <div className="space-y-1.5 max-w-sm mx-auto">
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSessionSelect(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 card card-hover text-left group"
                >
                  <div className="p-1.5 rounded-md bg-[var(--surface-inset)]">
                    <FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {s.name || `Audit #${s.id}`}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      {new Date(s.updated_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                      {s.transaction_count != null && ` · ${s.transaction_count} transactions`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
