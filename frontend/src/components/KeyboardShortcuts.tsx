import React from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { bulkAddTags } from '../lib/api'
import { buildManualTagReason } from './TagDetailDialog'

export const KeyboardShortcuts: React.FC = () => {
  const { toggleSidebar, toggleSettings, toggleExport, selectedTransactionIds, goHome, setShowNewAudit } = useUIStore()
  const { refreshCurrentSession, currentSession, setCurrentSession } = useSessionStore()

  const startNewAudit = () => {
    setCurrentSession(null)
    goHome()
    setShowNewAudit(true)
  }

  useHotkeys('esc', (e) => {
    e.preventDefault()
    const { settingsOpen, exportOpen, passwordDialogOpen, closeModals } = useUIStore.getState()
    if (settingsOpen || exportOpen || passwordDialogOpen) {
      closeModals()
      return
    }
    goHome()
  })
  useHotkeys('ctrl+n', (e) => { e.preventDefault(); startNewAudit() })
  useHotkeys('ctrl+b', (e) => { e.preventDefault(); toggleSidebar() })
  useHotkeys('ctrl+e', (e) => { e.preventDefault(); toggleExport() })
  useHotkeys('ctrl+,', (e) => { e.preventDefault(); toggleSettings() })
  useHotkeys('ctrl+r', (e) => { e.preventDefault(); refreshCurrentSession() })
  useHotkeys('ctrl+f', (e) => { e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus() })
  useHotkeys('ctrl+/', (e) => { e.preventDefault(); toggleSidebar() })
  useHotkeys('ctrl+shift+n', (e) => { e.preventDefault(); startNewAudit() })
  useHotkeys('ctrl+shift+e', (e) => { e.preventDefault(); if (currentSession) toggleExport() })
  useHotkeys('ctrl+shift+s', (e) => { e.preventDefault(); toggleSettings() })
  useHotkeys('ctrl+shift+r', (e) => { e.preventDefault(); goHome() })

  const handleBulkTag = async (tagType: 'client' | 'broker' | 'suspicious') => {
    const { refreshCurrentSession } = useSessionStore.getState()
    const { selectedTransactionIds, clearSelection, pushToast, requestTagDetail } = useUIStore.getState()
    if (selectedTransactionIds.length === 0) return

    const result = await requestTagDetail({ tagType, scope: 'bulk' })
    if (!result) return

    try {
      await bulkAddTags(selectedTransactionIds, result.tagType, buildManualTagReason(result.tagType, result.detail), 1.0)
      await refreshCurrentSession()
      clearSelection()
      pushToast({ message: `Tagged ${selectedTransactionIds.length} transactions as ${result.tagType}` })
    } catch {
      pushToast({ message: 'Bulk tag failed', type: 'error' })
    }
  }

  useHotkeys('ctrl+1', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('client') })
  useHotkeys('ctrl+2', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('broker') })
  useHotkeys('ctrl+3', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('suspicious') })

  return null
}
