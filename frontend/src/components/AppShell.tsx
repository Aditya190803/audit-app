import { useEffect, useState, useMemo, useCallback } from 'react'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuditAnalyticsWorker } from '../hooks/useAuditAnalyticsWorker'
import { EMPTY_AUDIT_ANALYTICS } from '../utils/auditAnalytics'
import type { AdvancedFilters } from '../utils/auditAnalytics'
import type { AuditSession } from '../types/api'
import { retagSession, getRecoverySession } from '../lib/api'

import { FileDropZone } from './FileDropZone'
import { DataTable } from './DataTable'
import { SearchFilters } from './SearchFilters'
import { AuditReviewPage } from './AuditReviewPage'
import { AuditLogPanel } from './AuditLogPanel'
import { SettingsPanel } from './SettingsPanel'
import { ExportPanel } from './ExportPanel'
import { ToastContainer } from './Toast'
import { KeyboardShortcuts } from './KeyboardShortcuts'
import { TransactionDrawer } from './TransactionDrawer'
import { BulkActionBar } from './BulkActionBar'
import { TagDetailDialog } from './TagDetailDialog'
import { SessionSidebar } from './SessionSidebar'
import { SessionToolbar } from './SessionToolbar'
import { WelcomeScreen } from './WelcomeScreen'
import { ConfirmDialog } from './ConfirmDialog'
import type { AppUpdateStatus } from '../types/electron'

export function AppShell() {
  const {
    sessions, currentSession, transactions, isLoading,
    setCurrentSession, loadSessions, refreshCurrentSession,
    processingError, clearProcessingError,
  } = useSessionStore()

  const {
    sidebarOpen, toggleSidebar, settingsOpen, toggleSettings,
    exportOpen, toggleExport, showNewAudit, setShowNewAudit,
    searchQuery, setSearchQuery, filterTags, resultFilter, setResultFilter,
    advancedFilters, setAdvancedFilter, activeFilterCount, filtersExpanded,
    toggleFiltersExpanded, activeTransactionId, setActiveTransaction,
    reviewView, setReviewView, goHome, pushToast,
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

  // Crash recovery: on mount check for an in-progress session
  useEffect(() => {
    getRecoverySession().then((res) => {
      if (res.data.found && res.data.session) {
        const recovered = res.data.session
        pushToast({
          message: `Last session "${recovered.name || `Audit #${recovered.id}`}" may be incomplete.`,
          type: 'info',
          persistent: true,
          action: {
            label: 'Restore',
            onClick: () => {
              setCurrentSession(recovered)
              setShowNewAudit(false)
            },
          },
        })
      }
    }).catch(() => {/* silently ignore */})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!window.electronAPI?.onBackendCrashed) return undefined
    return window.electronAPI.onBackendCrashed(({ code, signal }) => {
      const reason = signal || (code !== null ? `exit code ${code}` : 'unknown reason')
      pushToast({
        message: `Backend stopped (${reason}). Save your work and restart the app.`,
        action: { label: 'Reload', onClick: () => window.location.reload() },
      })
    })
  }, [pushToast])

  // Auto-update: when an update is downloaded (autoDownload is on), prompt
  // the user with a restart dialog instead of a passive toast.
  const [updatePrompt, setUpdatePrompt] = useState<AppUpdateStatus | null>(null)
  useEffect(() => {
    if (!window.electronAPI?.onUpdateStatus) return undefined
    return window.electronAPI.onUpdateStatus((status) => {
      if (status.status === 'downloaded') {
        setUpdatePrompt(status)
      }
    })
  }, [])

  const confirmInstallUpdate = () => {
    const status = updatePrompt
    setUpdatePrompt(null)
    window.electronAPI?.installUpdate?.()
    // If install doesn't quit immediately, keep the prompt dismissed; the app will quit when ready.
    void status
  }

  // Active view
  const [activeView, setActiveView] = useState<'data' | 'review' | 'activity'>('data')
  const [isRetagging, setIsRetagging] = useState(false)

  // Handle exception filter from review page
  const handleExceptionFilter = useCallback((key: string, value: string) => {
    if (key === 'exception') {
      setAdvancedFilter('exception', value as AdvancedFilters['exception'])
    } else if (key === 'resultFilter') {
      setResultFilter(value as 'all' | 'client' | 'broker' | 'suspicious')
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

  // Resolve active transaction for drawer
  const activeTransaction = activeTransactionId != null
    ? transactions.find((t) => t.id === activeTransactionId) ?? null
    : null

  // Re-tag handler
  const handleRetag = useCallback(async () => {
    if (!currentSession || isRetagging) return
    setIsRetagging(true)
    try {
      const res = await retagSession(currentSession.id)
      await refreshCurrentSession()
      pushToast({ message: `Re-tagged: ${res.data.tag_count} tags applied`, type: 'info' })
    } catch {
      pushToast({ message: 'Re-tagging failed', type: 'error' })
    } finally {
      setIsRetagging(false)
    }
  }, [currentSession, isRetagging, pushToast, refreshCurrentSession])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--surface)]">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <SessionSidebar
          sessions={sessions}
          currentSession={currentSession}
          isOpen={sidebarOpen}
          onToggle={toggleSidebar}
          onSessionSelect={handleSessionSelect}
          onNewAudit={handleNewAudit}
          onSettings={toggleSettings}
          onLoadSessions={loadSessions}
        />

        {/* Main content area */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top toolbar */}
          {hasSession && (
            <>
              <SessionToolbar
                session={currentSession!}
                activeView={activeView}
                onViewChange={setActiveView}
                onExport={toggleExport}
                onRetag={handleRetag}
                isRetagging={isRetagging}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filterCount={activeFilterCount()}
                onToggleFilters={toggleFiltersExpanded}
                isComputing={isComputing}
              />
            </>
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
                  <DataTable
                    analytics={resolvedAnalytics}
                    isLoading={isLoading}
                  />
                </>
              )}

              {hasSession && activeView === 'review' && (
                <AuditReviewPage
                  analytics={resolvedAnalytics}
                  activeTab={reviewView}
                  suspiciousThreshold={suspiciousThreshold}
                  onTabChange={setReviewView}
                  onExceptionFilter={handleExceptionFilter}
                />
              )}

              {hasSession && activeView === 'activity' && (
                <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--surface)]">
                  <AuditLogPanel sessionId={currentSession?.id ?? null} />
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
      {/* Transaction detail drawer */}
      <TransactionDrawer
        transaction={activeTransaction}
        onClose={() => setActiveTransaction(null)}
      />
      {/* Bulk action floating bar */}
      <BulkActionBar />
      <TagDetailDialog />

      {/* Update downloaded — prompt to restart and install */}
      <ConfirmDialog
        isOpen={updatePrompt !== null}
        title="Update ready to install"
        message={`A new version${updatePrompt?.version ? ` (v${updatePrompt.version})` : ''} has been downloaded. Restart the app now to apply the update?`}
        confirmLabel="Restart & Install"
        cancelLabel="Later"
        onConfirm={confirmInstallUpdate}
        onCancel={() => setUpdatePrompt(null)}
      />

      {/* Parse/processing error popup — surfaces backend failures instead of silently getting stuck */}
      <ConfirmDialog
        isOpen={processingError !== null}
        title="Could not start the audit"
        message={processingError ?? ''}
        confirmLabel="OK"
        cancelLabel="OK"
        danger
        onConfirm={clearProcessingError}
        onCancel={clearProcessingError}
      />

      <ToastContainer />
      <KeyboardShortcuts />
    </div>
  )
}
