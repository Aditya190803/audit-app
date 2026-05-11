import React from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { bulkAddTags } from '../lib/api'

export const KeyboardShortcuts: React.FC = () => {
  const { toggleSidebar, toggleSettings, toggleExport, selectedTransactionIds, goHome, setShowNewAudit } = useUIStore()
  const { refreshCurrentSession, currentSession } = useSessionStore()

  useHotkeys('esc', (e) => { e.preventDefault(); goHome() })
  useHotkeys('ctrl+n', (e) => { e.preventDefault(); goHome(); setShowNewAudit(true) })
  useHotkeys('ctrl+b', (e) => { e.preventDefault(); toggleSidebar() })
  useHotkeys('ctrl+e', (e) => { e.preventDefault(); toggleExport() })
  useHotkeys('ctrl+,', (e) => { e.preventDefault(); toggleSettings() })
  useHotkeys('ctrl+r', (e) => { e.preventDefault(); refreshCurrentSession() })
  useHotkeys('ctrl+f', (e) => { e.preventDefault(); document.querySelector<HTMLInputElement>('[placeholder*="Search"]')?.focus() })
  useHotkeys('ctrl+/', (e) => { e.preventDefault(); toggleSidebar() })
  useHotkeys('ctrl+shift+n', (e) => { e.preventDefault(); goHome(); setShowNewAudit(true) })
  useHotkeys('ctrl+shift+e', (e) => { e.preventDefault(); if (currentSession) toggleExport() })
  useHotkeys('ctrl+shift+s', (e) => { e.preventDefault(); toggleSettings() })
  useHotkeys('ctrl+shift+r', (e) => { e.preventDefault(); goHome() })

  const handleBulkTag = async (tagType: string) => {
    const { refreshCurrentSession } = useSessionStore.getState()
    const { selectedTransactionIds, clearSelection } = useUIStore.getState()
    if (selectedTransactionIds.length === 0) return
    await bulkAddTags(selectedTransactionIds, tagType)
    await refreshCurrentSession()
    clearSelection()
  }

  useHotkeys('ctrl+1', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('client') })
  useHotkeys('ctrl+2', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('broker') })
  useHotkeys('ctrl+3', (e) => { e.preventDefault(); if (selectedTransactionIds.length > 0) handleBulkTag('suspicious') })

  return null
}
