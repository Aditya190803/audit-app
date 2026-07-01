import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useDropzone, type DropzoneState } from 'react-dropzone'
import { FileText, FileSpreadsheet, Lock, X, ArrowRight } from 'lucide-react'
import { getParsers } from '../lib/api'
import type { ParseProgress } from '../types/api'
import { useSessionStore } from '../stores/sessionStore'
import { useClientListPreview, isCsv, isExcel } from '../hooks/useClientListPreview'
import { useApCodeSelection } from '../hooks/useApCodeSelection'
import { BrokerExclusionSelect } from './BrokerExclusionSelect'
import { ParserSelect } from './ParserSelect'
import { ApCodeSelect } from './ApCodeSelect'

interface FileDropZoneProps {
  onFilesSelected?: (
    pdf: File | File[],
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
  ) => void
  isProcessing?: boolean
  processingProgress?: ParseProgress | null
  brokers?: string[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isPdf(file: File): boolean {
  return file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'
}

function FileDropContainer({
  dropzone,
  label,
  activeLabel,
  selectedLabel,
  helpText,
}: {
  dropzone: DropzoneState
  label: string
  activeLabel: string
  selectedLabel?: string
  helpText?: string
}) {
  return (
    <div
      {...dropzone.getRootProps()}
      className={`
        group relative flex items-center justify-center p-6 rounded-[var(--radius-lg)]
        border-2 border-dashed transition-all duration-200 cursor-pointer
        ${dropzone.isDragActive
          ? 'border-[var(--primary)] bg-[var(--primary-subtle)] scale-[1.01]'
          : selectedLabel
            ? 'border-[var(--success)]/50 bg-[var(--success-subtle)] hover:border-[var(--success)]'
            : 'border-[var(--border)] bg-[var(--bg)] hover:border-[var(--primary)]/50 hover:bg-[var(--surface-hover)]'
        }
      `}
    >
      <input {...dropzone.getInputProps()} />
      <div className="text-center">
        <p className={`text-sm font-medium ${
          dropzone.isDragActive ? 'text-[var(--primary)]' : selectedLabel ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'
        }`}>
          {dropzone.isDragActive ? activeLabel : selectedLabel || label}
        </p>
        {helpText && !selectedLabel && (
          <p className="text-xs text-[var(--text-tertiary)] mt-1">{helpText}</p>
        )}
      </div>
    </div>
  )
}

function ParseProgressIndicator({
  progressPercent,
  message,
  stage,
  etaText,
  currentFile,
  totalFiles,
  currentPage,
  totalPages,
}: {
  progressPercent: number
  message?: string
  stage?: string
  etaText: string
  currentFile?: number
  totalFiles?: number
  currentPage?: number
  totalPages?: number
}) {
  return (
    <div className="space-y-3 p-4 bg-[var(--surface)] rounded-[var(--radius-lg)] border border-[var(--border)]">
      {/* Progress bar */}
      <div className="h-2 bg-[var(--bg-raised)] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--primary-hover)] rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          {stage && (
            <span className="font-medium text-[var(--primary)] capitalize">{stage}</span>
          )}
          {message && <span>{message}</span>}
        </div>
        <div className="flex items-center gap-3 text-[var(--text-tertiary)]">
          {currentFile != null && totalFiles != null && totalFiles > 0 && (
            <span>File {currentFile}/{totalFiles}</span>
          )}
          {currentPage != null && totalPages != null && totalPages > 0 && (
            <span>Page {currentPage}/{totalPages}</span>
          )}
          <span className="font-mono font-medium text-[var(--text-primary)]">
            {Math.round(progressPercent)}%
          </span>
          {etaText && <span>{etaText}</span>}
        </div>
      </div>
    </div>
  )
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesSelected, isProcessing: isProcessingProp, processingProgress: processingProgressProp, brokers = [] }) => {
  const sessionStore = useSessionStore()
  const isProcessing = isProcessingProp ?? sessionStore.isProcessing
  const processingProgress = processingProgressProp ?? sessionStore.processingProgress

  // PDF state
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [passwords, setPasswords] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)
  const [invalidPdfNames, setInvalidPdfNames] = useState<string[]>([])
  const progressStartRef = useRef<number>(0)
  const [threshold, setThreshold] = useState<number>(50000)

  // Broker state
  const [excludedBrokers, setExcludedBrokers] = useState<Set<string>>(new Set())

  // Parser state
  const [parsers, setParsers] = useState<{ name: string; display_name: string }[]>([])
  const [bankName, setBankName] = useState('')

  // Extracted hooks
  const clientList = useClientListPreview()
  const apCode = useApCodeSelection({
    clientListFile: clientList.clientListFile,
    detectedColumns: clientList.detectedColumns,
    excelWorkbook: clientList.excelWorkbook,
    sheetName: clientList.sheetName,
    headerRow: clientList.headerRow,
  })

  // Load parsers on mount
  useEffect(() => {
    getParsers().then((res: { data: { name: string; display_name: string }[] }) => {
      setParsers(res.data)
    }).catch((e: unknown) => {
      console.error('[FileDropZone] Failed to load parsers:', e)
    })
  }, [])

  // Validate PDF headers
  useEffect(() => {
    if (pdfFiles.length === 0) {
      setShowPassword(false)
      setInvalidPdfNames([])
      return
    }
    let completed = 0
    const badNames: string[] = []
    for (const f of pdfFiles) {
      const blob = f.slice(0, 4)
      const reader = new FileReader()
      reader.onload = (e) => {
        const head = e.target?.result as string
        if (head !== '%PDF') badNames.push(f.name)
        completed++
        if (completed === pdfFiles.length) {
          setInvalidPdfNames(badNames)
        }
      }
      reader.readAsText(blob)
    }
  }, [pdfFiles])

  const addPdfFiles = useCallback((files: File[]) => {
    const valid = files.filter(isPdf)
    if (valid.length > 0) {
      setPdfFiles((prev) => {
        const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`))
        const next = [...prev]
        for (const file of valid) {
          const key = `${file.name}:${file.size}:${file.lastModified}`
          if (!seen.has(key)) {
            seen.add(key)
            next.push(file)
          }
        }
        return next
      })
    }
  }, [])

  const onDropAnyFiles = useCallback((acceptedFiles: File[]) => {
    addPdfFiles(acceptedFiles)
    const clientCandidate = acceptedFiles.find((file) => isCsv(file) || isExcel(file))
    if (clientCandidate) {
      clientList.selectClientListFile(clientCandidate)
    }
  }, [addPdfFiles, clientList.selectClientListFile])

  const onDropPdf = useCallback((acceptedFiles: File[]) => {
    addPdfFiles(acceptedFiles)
  }, [addPdfFiles])

  const onDropClientList = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles.find((candidate) => isCsv(candidate) || isExcel(candidate))
    if (file) {
      clientList.selectClientListFile(file)
    }
  }, [clientList.selectClientListFile])

  const combinedDropzone = useDropzone({
    onDrop: onDropAnyFiles,
    accept: {
      'application/pdf': ['.pdf'],
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: true
  })

  const pdfDropzone = useDropzone({
    onDrop: onDropPdf,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true
  })

  const clientListDropzone = useDropzone({
    onDrop: onDropClientList,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  })

  const handleProcess = () => {
    if (pdfFiles.length > 0 && clientList.clientListFile) {
      const hasPasswords = Object.values(passwords).some(Boolean)
      const options: {
        password?: string
        sheetName?: string
        nameColumn?: string
        excludedBrokers?: string[]
        apCodes?: string[]
        bankName?: string
      } = {
        password: hasPasswords ? JSON.stringify(passwords) : undefined,
        excludedBrokers: excludedBrokers.size > 0 ? Array.from(excludedBrokers) : undefined,
        apCodes: apCode.apCodeEnabled && apCode.selectedApCodes.size > 0 ? Array.from(apCode.selectedApCodes) : undefined,
        bankName: bankName || undefined
      }
      if (isExcel(clientList.clientListFile) && clientList.sheetName.trim()) {
        options.sheetName = clientList.sheetName.trim()
      }
      if (clientList.nameColumn.trim()) {
        options.nameColumn = clientList.nameColumn.trim()
      }
      if (onFilesSelected) {
        onFilesSelected(pdfFiles, clientList.clientListFile, threshold, options)
      } else {
        sessionStore.processFiles(pdfFiles, clientList.clientListFile, threshold, options)
      }
    }
  }

  const isReady = pdfFiles.length > 0 && clientList.clientListFile && !isProcessing && clientList.nameColumn.trim().length > 0 && invalidPdfNames.length === 0
  const combinedSelectedLabel = pdfFiles.length > 0 || clientList.clientListFile
    ? `${pdfFiles.length} PDF${pdfFiles.length === 1 ? '' : 's'}${clientList.clientListFile ? ` + ${clientList.clientListFile.name}` : ''}`
    : undefined
  const progressPercent = Math.max(0, Math.min(100, processingProgress?.percent ?? 0))

  // ETA calculation
  if (isProcessing && progressPercent > 0 && progressStartRef.current === 0) {
    progressStartRef.current = Date.now()
  }
  if (!isProcessing) {
    progressStartRef.current = 0
  }
  const etaText = useMemo(() => {
    if (!isProcessing || progressPercent === 0) return ''
    const elapsed = (Date.now() - progressStartRef.current) / 1000
    if (elapsed < 5 || progressPercent < 5) return ''
    const total = (elapsed / progressPercent) * 100
    const remaining = total - elapsed
    if (remaining < 5) return 'Almost done'
    if (remaining < 60) return `~${Math.round(remaining)}s remaining`
    const mins = Math.floor(remaining / 60)
    const secs = Math.round(remaining % 60)
    return `~${mins}m ${secs}s remaining`
  }, [isProcessing, progressPercent])

  const getClientListLabel = (file: File) => {
    if (file.name.endsWith('.csv')) return 'CSV'
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) return 'Excel'
    return 'Spreadsheet'
  }

  const toggleBroker = (name: string) => {
    setExcludedBrokers((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="space-y-8">
      {/* Drop zones */}
      <div className="space-y-4">
        <FileDropContainer
          dropzone={combinedDropzone}
          label="Drop PDFs and client list together"
          activeLabel="Drop files to sort automatically"
          selectedLabel={combinedSelectedLabel}
          helpText="PDF statements plus one CSV or Excel file in one action"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FileDropContainer
            dropzone={pdfDropzone}
          label="Bank Statement"
          activeLabel="Drop PDFs here"
          selectedLabel={pdfFiles.length > 0 ? `${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''} selected` : undefined}
          helpText="PDF only (multiple allowed)"
          />

          <FileDropContainer
            dropzone={clientListDropzone}
            label="Client List"
            activeLabel="Drop file here"
            helpText="CSV or Excel"
          />
        </div>
      </div>

      {/* Invalid PDF warning */}
      {invalidPdfNames.length > 0 && (
        <div className="p-3 bg-[var(--danger-subtle)] border border-[var(--danger)]/30 rounded-[var(--radius-md)] text-xs text-[var(--danger)]">
          Invalid PDF{invalidPdfNames.length > 1 ? 's' : ''}: {invalidPdfNames.join(', ')} — file header does not start with %PDF
        </div>
      )}

      {/* File list */}
      {(pdfFiles.length > 0 || clientList.clientListFile) && (
        <div className="space-y-2">
          {pdfFiles.map((f, i) => {
            const isInvalid = invalidPdfNames.includes(f.name)
            return (
              <div key={f.name + f.size} className={`flex items-center gap-3 py-2 ${isInvalid ? 'opacity-50' : ''}`}>
                <FileText className={`h-4 w-4 shrink-0 ${isInvalid ? 'text-[var(--danger)]' : 'text-[var(--danger)]'}`} strokeWidth={1.5} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isInvalid ? 'text-[var(--danger)] line-through' : 'text-[var(--text-primary)]'}`}>
                    {f.name}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)]">{formatFileSize(f.size)}{isInvalid ? ' — invalid PDF' : ''}</p>
                </div>
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className={`p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${passwords[f.name] ? 'text-[var(--primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                  title={passwords[f.name] ? 'Password set' : 'Set password (optional)'}
                >
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
                <button
                  onClick={() => {
                    const next = pdfFiles.filter((_, j) => j !== i)
                    setPdfFiles(next)
                    if (next.length === 0) { setPasswords({}); setShowPassword(false); setInvalidPdfNames([]) }
                  }}
                  className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors duration-150"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </div>
            )
          })}

          {showPassword && pdfFiles.length > 0 && (
            <div className="space-y-2 border-l-2 border-[var(--border)] pl-3 ml-1">
              <p className="text-[11px] font-medium text-[var(--text-tertiary)]">Passwords (optional):</p>
              {pdfFiles.map((f) => (
                <div key={f.name} className="flex items-center gap-2">
                  <Lock className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" strokeWidth={1.5} />
                  <span className="text-xs text-[var(--text-secondary)] truncate flex-1">{f.name}</span>
                  <input
                    type="password"
                    placeholder="Enter password"
                    value={passwords[f.name] || ''}
                    onChange={(e) => setPasswords((prev) => ({ ...prev, [f.name]: e.target.value }))}
                    className="input-field w-40 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {clientList.clientListFile && (
            <div className="flex items-center gap-3 py-2">
              <FileSpreadsheet className="h-4 w-4 text-[var(--success)] shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{clientList.clientListFile.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{getClientListLabel(clientList.clientListFile)} · {formatFileSize(clientList.clientListFile.size)}</p>
              </div>
              <button
                onClick={() => clientList.selectClientListFile(null as unknown as File)}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors duration-150"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Parsing options */}
      {clientList.clientListFile && (
        <div className="border-t border-[var(--border)] pt-6 space-y-5">
          {isExcel(clientList.clientListFile) && clientList.sheetNames.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Sheet Name
              </label>
              <select
                value={clientList.sheetName}
                onChange={(e) => clientList.setSheetName(e.target.value)}
                className="input-field"
              >
                {clientList.sheetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {isCsv(clientList.clientListFile) && clientList.csvFirstRows.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Header Row
              </label>
              <select
                value={clientList.headerRow}
                onChange={(e) => clientList.setHeaderRow(Number(e.target.value))}
                className="input-field"
              >
                {clientList.csvFirstRows.map((_, i) => (
                  <option key={i} value={i}>Row {i + 1}</option>
                ))}
                <option value={-1}>No header (auto-generate column names)</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Name Column
            </label>
            {clientList.detectedColumns.length > 0 ? (
              <select
                value={clientList.nameColumn}
                onChange={(e) => clientList.setNameColumn(e.target.value)}
                className="input-field"
              >
                <option value="">Select a column...</option>
                {clientList.detectedColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                list="name-column-suggestions"
                placeholder="e.g., Name, Client_Name"
                value={clientList.nameColumn}
                onChange={(e) => clientList.setNameColumn(e.target.value)}
                className="input-field"
              />
            )}
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {clientList.detectedColumns.length > 0
                ? 'Auto-detected from file. Select the column containing client names.'
                : 'Enter the column name that contains client names.'}
            </p>
          </div>
        </div>
      )}

      {/* AP Code filtering */}
      {clientList.nameColumn && (
        <ApCodeSelect
          apCodeEnabled={apCode.apCodeEnabled}
          setApCodeEnabled={apCode.setApCodeEnabled}
          apCodeColumn={apCode.apCodeColumn}
          setApCodeColumn={apCode.setApCodeColumn}
          availableApCodes={apCode.availableApCodes}
          selectedApCodes={apCode.selectedApCodes}
          setSelectedApCodes={apCode.setSelectedApCodes}
          apCodeDropdownOpen={apCode.apCodeDropdownOpen}
          setApCodeDropdownOpen={apCode.setApCodeDropdownOpen}
          apCodeSearch={apCode.apCodeSearch}
          setApCodeSearch={apCode.setApCodeSearch}
          apCodeLoading={apCode.apCodeLoading}
          apCodeDropdownRef={apCode.apCodeDropdownRef}
          detectedColumns={clientList.detectedColumns}
        />
      )}

      {/* Bank selection */}
      <ParserSelect parsers={parsers} value={bankName} onChange={setBankName} />

      {/* Broker exclusions */}
      <BrokerExclusionSelect
        brokers={brokers}
        excludedBrokers={excludedBrokers}
        onToggle={toggleBroker}
        onSelectAll={() => setExcludedBrokers(new Set(brokers))}
        onClearAll={() => setExcludedBrokers(new Set())}
      />

      {/* Threshold */}
      <div className="border-t border-[var(--border)] pt-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            Suspicious Amount Threshold
          </label>
          <span className="text-sm font-mono font-medium text-[var(--primary)]">
            ₹{threshold.toLocaleString('en-IN')}
          </span>
        </div>
        <input
          type="range"
          min={10000}
          max={500000}
          step={10000}
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
          className="w-full accent-[var(--primary)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mt-1">
          <span>₹10,000</span>
          <span>₹5,00,000</span>
        </div>
      </div>

      {/* Start Audit */}
      {isProcessing && (
        <ParseProgressIndicator
          progressPercent={progressPercent}
          message={processingProgress?.message}
          stage={processingProgress?.stage}
          etaText={etaText}
          currentFile={processingProgress?.current_file}
          totalFiles={processingProgress?.total_files}
          currentPage={processingProgress?.current_page}
          totalPages={processingProgress?.total_pages}
        />
      )}

      <button
        onClick={handleProcess}
        disabled={!isReady}
        className="btn-primary w-full"
      >
        {isProcessing ? (
          <>
            <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/30 border-t-white mr-2" />
            Processing...
          </>
        ) : (
          <>
            Start Audit
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
          </>
        )}
      </button>
    </div>
  )
}
