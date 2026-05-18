import React, { useState } from 'react'
import { X, Download, FileSpreadsheet } from 'lucide-react'
import type { ExportFormat } from '../types/api'
import { exportFile } from '../lib/api'
import { useUIStore } from '../stores/uiStore'

interface ExportPanelProps {
  isOpen: boolean
  onClose: () => void
  sessionId: number | null
  selectedIds?: number[]
}

const EXPORT_FORMATS: { value: ExportFormat; label: string; icon: React.ReactNode }[] = [
  { value: 'excel', label: 'Excel Workbook', icon: <FileSpreadsheet className="h-4 w-4" strokeWidth={1.5} /> }
]

export const ExportPanel: React.FC<ExportPanelProps> = ({ isOpen, onClose, sessionId }) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('excel')
  const [isExporting, setIsExporting] = useState(false)
  const pushToast = useUIStore((s) => s.pushToast)

  if (!isOpen) return null

  const handleExport = async () => {
    if (!sessionId) return
    setIsExporting(true)
    try {
      const { showSaveDialog } = window.electronAPI
      const defaultExt = 'xlsx'
      const filters = [{ name: 'EXCEL', extensions: ['xlsx'] }]

      const result = await showSaveDialog({
        defaultPath: `audit_workbook.${defaultExt}`,
        filters
      })

      if (!result.canceled && result.filePath) {
        await exportFile(sessionId, 'all', selectedFormat, result.filePath)
        pushToast({ message: `Export complete: ${result.filePath.split(/[\\/]/).pop() || result.filePath}` })
        onClose()
      }
    } catch (e) {
      console.error('Export failed:', e)
      alert('Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Export Results</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors duration-150"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {selectedFormat === 'excel' && (
            <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-xs leading-5 text-[var(--text-secondary)]">
              Excel exports the full audit workbook with account transactions, client, broker, and suspicious sheets.
            </div>
          )}

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
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}
