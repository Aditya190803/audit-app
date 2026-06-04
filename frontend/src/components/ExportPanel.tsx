import React, { useRef, useState } from 'react'
import { X, Download, FileSpreadsheet } from 'lucide-react'
import { exportFile } from '../lib/api'
import { useUIStore } from '../stores/uiStore'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ExportPanelProps {
  isOpen: boolean
  onClose: () => void
  sessionId: number | null
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ isOpen, onClose, sessionId }) => {
  const [isExporting, setIsExporting] = useState(false)
  const { pushToast } = useUIStore()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen, onClose)

  if (!isOpen) return null

  const handleExport = async () => {
    if (!sessionId) return
    setIsExporting(true)
    try {
      const result = await window.electronAPI.showSaveDialog({
        defaultPath: 'audit_results.xlsx',
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      })

      if (!result.canceled && result.filePath) {
        await exportFile(sessionId, 'all', 'excel', result.filePath, undefined, result.exportPathToken)
        pushToast({ message: `Export complete: ${result.filePath.split(/[\\/]/).pop() || result.filePath}` })
        onClose()
      }
    } catch (e: any) {
      console.error('Export failed:', e)
      const msg = e?.response?.data?.detail || e?.message || 'Export failed. Please try again.'
      pushToast({ message: msg, type: 'error' })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 id="export-title" className="text-sm font-semibold text-[var(--text-primary)]">Export Results</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors duration-150"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg)] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-bg)] text-[var(--primary)]">
              <FileSpreadsheet className="h-5 w-5" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-primary)]">Single Excel workbook</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                Downloads one .xlsx file with separate sheets for Account Transactions, Client, Broker, Suspicious, and suspicious subcategories.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!sessionId || isExporting}
            className="btn-primary flex items-center gap-1.5 text-xs"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2} />
            {isExporting ? 'Exporting...' : 'Download Excel'}
          </button>
        </div>
      </div>
    </div>
  )
}
