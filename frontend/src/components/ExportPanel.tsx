import React, { useRef, useState } from 'react'
import { X, Download, FileSpreadsheet } from 'lucide-react'
import type { ExportFormat, ExportType } from '../types/api'
import { exportFile } from '../lib/api'
import { useUIStore } from '../stores/uiStore'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ExportPanelProps {
  isOpen: boolean
  onClose: () => void
  sessionId: number | null
  selectedIds?: number[]
}

const EXPORT_FORMATS: { value: ExportFormat; label: string; icon: React.ReactNode }[] = [
  { value: 'excel', label: 'Excel Workbook', icon: <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} /> }
]

const EXPORT_SCOPE_OPTIONS: { value: ExportType; label: string; description: string }[] = [
  { value: 'all', label: 'All Transactions', description: 'Full audit workbook with all sheets' },
  { value: 'client', label: 'Clients Only', description: 'Only client-tagged transactions' },
  { value: 'broker', label: 'Brokers Only', description: 'Only broker-tagged transactions' },
  { value: 'suspicious', label: 'Suspicious Only', description: 'Only suspicious-tagged transactions' },
  { value: 'tagged', label: 'All Tagged', description: 'All transactions that have any tag' },
]

export const ExportPanel: React.FC<ExportPanelProps> = ({ isOpen, onClose, sessionId, selectedIds = [] }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('excel')
  const [exportScope, setExportScope] = useState<ExportType>('all')
  const [isExporting, setIsExporting] = useState(false)
  const { pushToast } = useUIStore()
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen, onClose)

  if (!isOpen) return null

  const handleExport = async () => {
    if (!sessionId) return
    setIsExporting(true)
    try {
      const { showSaveDialog } = window.electronAPI
      const defaultExt = 'xlsx'
      const filters = [{ name: 'EXCEL', extensions: ['xlsx'] }]

      const result = await showSaveDialog({
        defaultPath: `audit_${exportScope}.${defaultExt}`,
        filters
      })

      if (!result.canceled && result.filePath) {
        const idsToPass = selectedIds.length > 0 ? selectedIds : undefined
        await exportFile(sessionId, exportScope, selectedFormat, result.filePath, idsToPass, result.exportPathToken)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
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

        <div className="p-5 space-y-5">
          {/* Export scope selector */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">
              Export Scope
            </label>
            <div className="space-y-1.5">
              {EXPORT_SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExportScope(opt.value)}
                  className={`flex items-start gap-2 w-full px-3 py-2 text-left rounded-[var(--radius-md)] border transition-colors duration-150 ${
                    exportScope === opt.value
                      ? 'border-[var(--primary)] bg-[var(--primary-subtle)]'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${exportScope === opt.value ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'}`}>
                      {opt.label}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{opt.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Format selector */}
          <div>
            <label className="block text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider mb-2">Format</label>
            <div className="grid grid-cols-1 gap-1.5">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt.value}
                  onClick={() => setSelectedFormat(fmt.value)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-[var(--radius-md)] border transition-colors duration-150 ${
                    selectedFormat === fmt.value
                      ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]'
                      : 'border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--text-primary)]'
                  }`}
                >
                  {fmt.icon}
                  {fmt.label}
                </button>
              ))}
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
            {isExporting ? 'Exporting...' : `Export ${exportScope !== 'all' ? `(${exportScope})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}
