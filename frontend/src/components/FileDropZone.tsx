import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, FileText, FileSpreadsheet, Lock, X, ArrowRight, ChevronDown, Search, Check, FolderOpen, FileIcon, RefreshCw, Building2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { getParsers } from '../lib/api'

interface FileDropZoneProps {
  onFilesSelected: (
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
  isProcessing: boolean
  brokers?: string[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isExcel(file: File): boolean {
  return file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
}

function isCsv(file: File): boolean {
  return file.name.endsWith('.csv') || file.type === 'text/csv'
}

const COMMON_NAME_COLUMNS = [
  'name', 'client_name', 'client name', 'customer_name', 'customer name',
  'party_name', 'party name', 'account_name', 'account name', 'client',
  'customer', 'party', 'beneficiary', 'payee', 'drawer'
]

const AP_CODE_KEYWORDS = ['ap code', 'ap_code', 'apcode', 'ap codes', 'ap_codes', 'apcodes']

function bestApCodeColumnMatch(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, '_'))
  for (const candidate of AP_CODE_KEYWORDS) {
    const candNorm = candidate.toLowerCase().replace(/[_\s]+/g, '_')
    const exact = normalized.findIndex((h) => h === candNorm)
    if (exact >= 0) return headers[exact]
    const includes = normalized.findIndex((h) => h.includes(candNorm))
    if (includes >= 0) return headers[includes]
  }
  return null
}

function bestNameColumnMatch(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, '_'))
  for (const candidate of COMMON_NAME_COLUMNS) {
    const candNorm = candidate.toLowerCase().replace(/[_\s]+/g, '_')
    const exact = normalized.findIndex((h) => h === candNorm)
    if (exact >= 0) return headers[exact]
    const includes = normalized.findIndex((h) => h.includes(candNorm))
    if (includes >= 0) return headers[includes]
  }
  return headers[0] ?? null
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({ onFilesSelected, isProcessing, brokers = [] }) => {
  const [pdfFiles, setPdfFiles] = useState<File[]>([])
  const [clientListFile, setClientListFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isEncrypted, setIsEncrypted] = useState(false)
  const [threshold, setThreshold] = useState<number>(50000)
  const [sheetName, setSheetName] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [headerRow, setHeaderRow] = useState<number>(0)
  const [csvFirstRows, setCsvFirstRows] = useState<string[][]>([])
  const [nameColumn, setNameColumn] = useState('')
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [excludedBrokers, setExcludedBrokers] = useState<Set<string>>(new Set())
  const [brokerDropdownOpen, setBrokerDropdownOpen] = useState(false)
  const [brokerSearch, setBrokerSearch] = useState('')
  const brokerDropdownRef = useRef<HTMLDivElement>(null)
  const [exampleFolders, setExampleFolders] = useState<Record<string, string[]> | null>(null)
  const [clientListPath, setClientListPath] = useState<string | null>(null)
  const [loadingExample, setLoadingExample] = useState<string | null>(null)
  const [exampleLoading, setExampleLoading] = useState(true)
  const [parsers, setParsers] = useState<{ name: string; display_name: string }[]>([])
  const [bankName, setBankName] = useState('')

  const [apCodeEnabled, setApCodeEnabled] = useState(true)
  const [apCodeColumn, setApCodeColumn] = useState('')
  const [availableApCodes, setAvailableApCodes] = useState<string[]>([])
  const [selectedApCodes, setSelectedApCodes] = useState<Set<string>>(new Set())
  const [apCodeDropdownOpen, setApCodeDropdownOpen] = useState(false)
  const [apCodeSearch, setApCodeSearch] = useState('')
  const [apCodeLoading, setApCodeLoading] = useState(false)
  const apCodeDropdownRef = useRef<HTMLDivElement>(null)

  // Load parsers on mount
  useEffect(() => {
    getParsers().then((res) => {
      setParsers(res.data)
    }).catch((e) => {
      console.error('[FileDropZone] Failed to load parsers:', e)
    })
  }, [])

  // Load example files on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.electronAPI?.readExampleFiles) {
      setExampleLoading(true)
      window.electronAPI.readExampleFiles().then((result) => {
        setExampleFolders(result.folders)
        setClientListPath(result.clientList)
        setExampleLoading(false)
      }).catch(() => setExampleLoading(false))
    } else {
      setExampleLoading(false)
    }
  }, [])

  const loadExamplePair = async (pdfPath: string) => {
    if (!clientListPath || !window.electronAPI?.readFileBase64) return
    setLoadingExample(pdfPath)
    try {
      const [pdfResult, clientResult] = await Promise.all([
        window.electronAPI.readFileBase64(pdfPath),
        window.electronAPI.readFileBase64(clientListPath)
      ])
      if (pdfResult && clientResult) {
        const pdfBlob = await fetch(`data:application/pdf;base64,${pdfResult.data}`).then((r) => r.blob())
        const pdfFile = new File([pdfBlob], pdfResult.name, { type: 'application/pdf' })
        const ext = clientResult.name.endsWith('.csv') ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        const clientBlob = await fetch(`data:${ext};base64,${clientResult.data}`).then((r) => r.blob())
        const clientFile = new File([clientBlob], clientResult.name, { type: ext })
        setPdfFiles([pdfFile])
        setClientListFile(clientFile)
        setShowPassword(false)
        setPassword('')
      }
    } catch (e) {
      console.error('Failed to load example files:', e)
    }
    setLoadingExample(null)
  }

  // Parse columns from selected header row (CSV only)
  useEffect(() => {
    if (csvFirstRows.length === 0) return
    if (headerRow === -1) {
      const colCount = Math.max(...csvFirstRows.map((r) => r.length))
      const cols = Array.from({ length: colCount }, (_, i) => `Column ${i + 1}`)
      setDetectedColumns(cols)
      setNameColumn(cols[0] ?? '')
      return
    }
    if (headerRow < csvFirstRows.length) {
      const headers = csvFirstRows[headerRow].map((h) => h.trim()).filter(Boolean)
      setDetectedColumns(headers)
      const best = bestNameColumnMatch(headers)
      if (best) setNameColumn(best)
    }
  }, [headerRow, csvFirstRows])

  // Parse columns when selected sheet changes (Excel only)
  useEffect(() => {
    if (!excelWorkbook || !sheetName) return
    const ws = excelWorkbook.Sheets[sheetName]
    if (!ws) return
    const headers = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
    if (headers.length > 0) {
      const cols = headers[0].map((h) => String(h).trim()).filter(Boolean)
      setDetectedColumns(cols)
      const best = bestNameColumnMatch(cols)
      if (best) setNameColumn(best)
    }
  }, [excelWorkbook, sheetName])

  // Auto-detect AP code column
  useEffect(() => {
    if (!clientListFile || detectedColumns.length === 0) {
      setApCodeColumn('')
      setAvailableApCodes([])
      setSelectedApCodes(new Set())
      return
    }
    const best = bestApCodeColumnMatch(detectedColumns)
    setApCodeColumn(best || '')
  }, [clientListFile, detectedColumns])

  // Parse AP codes from file when column is known
  useEffect(() => {
    if (!clientListFile || !apCodeColumn || !apCodeEnabled) {
      setAvailableApCodes([])
      return
    }

    let cancelled = false
    const fn = async () => {
      setApCodeLoading(true)
      try {
        let rows: Record<string, unknown>[] = []

        if (isExcel(clientListFile) && excelWorkbook) {
          const ws = excelWorkbook.Sheets[sheetName || excelWorkbook.SheetNames[0]]
          if (ws) {
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
          }
        } else {
          const text = await clientListFile.text()
          const wb = XLSX.read(text, { type: 'string' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          if (ws) {
            rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
          }
        }

        if (cancelled) return

        const codes = new Set<string>()
        for (const row of rows) {
          const val = String(row[apCodeColumn] ?? '').trim()
          if (val && val.toLowerCase() !== 'nan' && val !== '') {
            codes.add(val)
          }
        }
        setAvailableApCodes(Array.from(codes).sort())
      } catch (e) {
        console.error('[FileDropZone] Failed to parse AP codes:', e)
        setAvailableApCodes([])
      }
      setApCodeLoading(false)
    }
    fn()
    return () => { cancelled = true }
  }, [clientListFile, apCodeColumn, sheetName, apCodeEnabled, excelWorkbook])

  // Detect if first PDF is encrypted
  useEffect(() => {
    if (pdfFiles.length === 0) {
      setIsEncrypted(false)
      setShowPassword(false)
      return
    }
    const f = pdfFiles[0]
    const blob = f.slice(Math.max(0, f.size - 8192))
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const encrypted = text.includes('/Encrypt')
      setIsEncrypted(encrypted)
      if (encrypted) setShowPassword(true)
    }
    reader.readAsText(blob)
  }, [pdfFiles])

  // Close broker dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (brokerDropdownRef.current && !brokerDropdownRef.current.contains(e.target as Node)) {
        setBrokerDropdownOpen(false)
      }
    }
    if (brokerDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [brokerDropdownOpen])

  // Close AP code dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (apCodeDropdownRef.current && !apCodeDropdownRef.current.contains(e.target as Node)) {
        setApCodeDropdownOpen(false)
      }
    }
    if (apCodeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [apCodeDropdownOpen])

  // Parse CSV headers or Excel sheets when client list file changes
  useEffect(() => {
    if (!clientListFile) {
      setDetectedColumns([])
      setCsvFirstRows([])
      setHeaderRow(0)
      setSheetNames([])
      setSheetName('')
      setExcelWorkbook(null)
      return
    }

    if (isCsv(clientListFile)) {
      setSheetNames([])
      setSheetName('')
      setExcelWorkbook(null)
      setHeaderRow(0)
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = String(e.target?.result || '')
        const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
        const firstRows = lines.slice(0, 10).map((line) =>
          line.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''))
        )
        setCsvFirstRows(firstRows)
      }
      reader.readAsText(clientListFile.slice(0, 16384))
      return
    }

    if (isExcel(clientListFile)) {
      const reader = new FileReader()
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        setExcelWorkbook(workbook)
        const sheets = workbook.SheetNames
        setSheetNames(sheets)

        if (sheets.length > 0) {
          const firstSheet = sheets[0]
          setSheetName(firstSheet)
          const ws = workbook.Sheets[firstSheet]
          const headers = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
          if (headers.length > 0) {
            const cols = headers[0].map((h) => String(h).trim()).filter(Boolean)
            setDetectedColumns(cols)
            const best = bestNameColumnMatch(cols)
            if (best) setNameColumn(best)
          }
        }
      }
      reader.readAsArrayBuffer(clientListFile.slice(0, 2 * 1024 * 1024))
    }
  }, [clientListFile])

  const onDropPdf = useCallback((acceptedFiles: File[]) => {
    const valid = acceptedFiles.filter(f => f.type === 'application/pdf' || f.name.endsWith('.pdf'))
    if (valid.length > 0) {
      setPdfFiles(prev => [...prev, ...valid])
    }
  }, [])

  const onDropClientList = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setClientListFile(file)
      setSheetName('')
      setSheetNames([])
      setNameColumn('')
      setDetectedColumns([])
      setCsvFirstRows([])
      setHeaderRow(0)
      setExcelWorkbook(null)
    }
  }, [])

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
    if (pdfFiles.length > 0 && clientListFile) {
      const options: Parameters<typeof onFilesSelected>[3] = {
        password: password || undefined,
        excludedBrokers: excludedBrokers.size > 0 ? Array.from(excludedBrokers) : undefined,
        apCodes: apCodeEnabled && selectedApCodes.size > 0 ? Array.from(selectedApCodes) : undefined,
        bankName: bankName || undefined
      }
      if (isExcel(clientListFile) && sheetName.trim()) {
        options.sheetName = sheetName.trim()
      }
      if (nameColumn.trim()) {
        options.nameColumn = nameColumn.trim()
      }
      onFilesSelected(pdfFiles, clientListFile, threshold, options)
    }
  }

  const isReady = pdfFiles.length > 0 && clientListFile && !isProcessing && nameColumn.trim().length > 0

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
      {/* Quick Load - Example Files */}
      {exampleLoading ? null : exampleFolders && Object.keys(exampleFolders).length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] flex items-center gap-2">
            <FolderOpen className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Quick Load</span>
          </div>
          <div className="p-3 space-y-3">
            {Object.entries(exampleFolders).map(([folder, files]) => (
              <div key={folder}>
                <div className="text-[11px] font-medium text-[var(--text-secondary)] mb-1.5 px-1 capitalize">
                  {folder.replace(/-/g, ' ')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {files.map((filePath) => {
                    const name = filePath.split('/').pop() || filePath.split('\\').pop() || filePath
                    const isLoading = loadingExample === filePath
                    const isActive = pdfFiles.some(f => f.name === name)
                    return (
                      <button
                        key={filePath}
                        onClick={() => loadExamplePair(filePath)}
                        disabled={!!loadingExample}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border transition-colors duration-150 ${
                          isActive
                            ? 'border-[var(--primary)] bg-[var(--primary-subtle)] text-[var(--primary)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'
                        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
                      >
                        {isLoading ? (
                          <RefreshCw className="h-3 w-3 animate-spin" strokeWidth={2} />
                        ) : (
                          <FileIcon className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                        )}
                        {name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Drop zones */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          {...pdfDropzone.getRootProps()}
          className={`border-2 border-dashed rounded-[var(--radius-lg)] p-8 text-center cursor-pointer transition-colors duration-150 ${
            pdfDropzone.isDragActive
              ? 'border-[var(--primary)]'
              : 'border-[var(--border-strong)] hover:border-[var(--primary)]'
          }`}
        >
          <input {...pdfDropzone.getInputProps()} />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {pdfDropzone.isDragActive ? 'Drop PDFs here' : pdfFiles.length > 0 ? `${pdfFiles.length} PDF${pdfFiles.length > 1 ? 's' : ''} selected` : 'Bank Statement'}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">PDF only (multiple allowed)</p>
        </div>

        <div
          {...clientListDropzone.getRootProps()}
          className={`border-2 border-dashed rounded-[var(--radius-lg)] p-8 text-center cursor-pointer transition-colors duration-150 ${
            clientListDropzone.isDragActive
              ? 'border-[var(--primary)]'
              : 'border-[var(--border-strong)] hover:border-[var(--primary)]'
          }`}
        >
          <input {...clientListDropzone.getInputProps()} />
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {clientListDropzone.isDragActive ? 'Drop file here' : 'Client List'}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">CSV or Excel</p>
        </div>
      </div>

      {/* File list */}
      {(pdfFiles.length > 0 || clientListFile) && (
        <div className="space-y-2">
          {pdfFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <FileText className="h-4 w-4 text-[var(--danger)] shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{f.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{formatFileSize(f.size)}</p>
              </div>
              {i === 0 && isEncrypted && (
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className={`p-1.5 rounded-[var(--radius-sm)] transition-colors duration-150 ${showPassword ? 'text-[var(--primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                  title="Password protected"
                >
                  <Lock className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
              <button
                onClick={() => {
                  const next = pdfFiles.filter((_, j) => j !== i)
                  setPdfFiles(next)
                  if (next.length === 0) { setPassword(''); setShowPassword(false); setIsEncrypted(false) }
                }}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors duration-150"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          ))}

          {showPassword && pdfFiles.length > 0 && (
            <input
              type="password"
              placeholder="Enter PDF password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
            />
          )}

          {clientListFile && (
            <div className="flex items-center gap-3 py-2">
              <FileSpreadsheet className="h-4 w-4 text-[var(--success)] shrink-0" strokeWidth={1.5} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)] truncate">{clientListFile.name}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{getClientListLabel(clientListFile)} · {formatFileSize(clientListFile.size)}</p>
              </div>
              <button
                onClick={() => { setClientListFile(null); setDetectedColumns([]); setCsvFirstRows([]); setHeaderRow(0); setNameColumn(''); setSheetName(''); setSheetNames([]); setExcelWorkbook(null) }}
                className="p-1 text-[var(--text-tertiary)] hover:text-[var(--danger)] transition-colors duration-150"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Parsing options */}
      {clientListFile && (
        <div className="border-t border-[var(--border)] pt-6 space-y-5">
          {isExcel(clientListFile) && sheetNames.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Sheet Name
              </label>
              <select
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                className="input-field"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          {isCsv(clientListFile) && csvFirstRows.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                Header Row
              </label>
              <select
                value={headerRow}
                onChange={(e) => setHeaderRow(Number(e.target.value))}
                className="input-field"
              >
                {csvFirstRows.map((_, i) => (
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
            {detectedColumns.length > 0 ? (
              <select
                value={nameColumn}
                onChange={(e) => setNameColumn(e.target.value)}
                className="input-field"
              >
                <option value="">Select a column...</option>
                {detectedColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                list="name-column-suggestions"
                placeholder="e.g., Name, Client_Name"
                value={nameColumn}
                onChange={(e) => setNameColumn(e.target.value)}
                className="input-field"
              />
            )}
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              {detectedColumns.length > 0
                ? 'Auto-detected from file. Select the column containing client names.'
                : 'Enter the column name that contains client names.'}
            </p>
          </div>
        </div>
      )}

      {/* AP Code filtering */}
      {nameColumn && (
        <div className="border-t border-[var(--border)] pt-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--text-primary)]">
              AP Code Available
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={apCodeEnabled}
              onClick={() => {
                setApCodeEnabled((v) => !v)
                if (apCodeEnabled) {
                  setSelectedApCodes(new Set())
                }
              }}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 ${
                apCodeEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
                apCodeEnabled ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {apCodeEnabled && apCodeColumn && (
            <div>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
                AP Code Column
              </label>
              <select
                value={apCodeColumn}
                onChange={(e) => setApCodeColumn(e.target.value)}
                className="input-field"
              >
                {detectedColumns.map((col) => (
                  <option key={col} value={col}>{col}</option>
                ))}
              </select>
            </div>
          )}

          {apCodeEnabled && (
            <div className="relative" ref={apCodeDropdownRef}>
              <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
                AP Codes <span className="text-xs font-normal normal-case text-[var(--text-tertiary)]">(select to include related clients)</span>
              </label>
              <button
                onClick={() => {
                  if (availableApCodes.length > 0) setApCodeDropdownOpen((o) => !o)
                }}
                disabled={apCodeLoading}
                className={`w-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm transition-colors duration-150 ${
                  availableApCodes.length > 0 ? 'hover:border-[var(--primary)]' : 'opacity-60 cursor-not-allowed'
                }`}
              >
                <span className={selectedApCodes.size > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
                  {apCodeLoading
                    ? 'Loading...'
                    : availableApCodes.length === 0
                      ? apCodeColumn ? 'No AP codes found' : 'No AP code column detected'
                      : selectedApCodes.size > 0
                        ? `${selectedApCodes.size} AP code${selectedApCodes.size > 1 ? 's' : ''} selected`
                        : `${availableApCodes.length} AP code${availableApCodes.length > 1 ? 's' : ''} available`}
                </span>
                {!apCodeLoading && availableApCodes.length > 0 && (
                  <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-150 ${apCodeDropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
                )}
              </button>

              {apCodeDropdownOpen && availableApCodes.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-[var(--border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-hidden">
                  <div className="p-2 border-b border-[var(--border)]">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                      <input
                        type="text"
                        placeholder="Search AP codes..."
                        value={apCodeSearch}
                        onChange={(e) => setApCodeSearch(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                        autoFocus
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg)]">
                    <button
                      onClick={() => setSelectedApCodes(new Set(availableApCodes))}
                      className="text-[11px] font-medium text-[var(--primary)] hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelectedApCodes(new Set())}
                      className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto">
                    {availableApCodes
                      .filter((code) => code.toLowerCase().includes(apCodeSearch.toLowerCase()))
                      .map((code) => {
                        const isSelected = selectedApCodes.has(code)
                        return (
                          <button
                            key={code}
                            onClick={() => {
                              setSelectedApCodes((prev) => {
                                const next = new Set(prev)
                                if (next.has(code)) next.delete(code)
                                else next.add(code)
                                return next
                              })
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150 ${
                              isSelected ? 'bg-[var(--primary-subtle)] text-[var(--primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                            }`}
                          >
                            <span className={`h-4 w-4 rounded-[var(--radius-sm)] border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                              isSelected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-strong)]'
                            }`}>
                              {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                            <span className="truncate">{code}</span>
                          </button>
                        )
                      })}
                    {availableApCodes.filter((code) => code.toLowerCase().includes(apCodeSearch.toLowerCase())).length === 0 && (
                      <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                        No AP codes match your search
                      </div>
                    )}
                  </div>

                  <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-tertiary)] text-center">
                    {selectedApCodes.size} of {availableApCodes.length} selected · Clients without AP code always included
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bank selection */}
      {parsers.length > 0 && (
        <div className="border-t border-[var(--border)] pt-6">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Bank Format</span>
          </div>
          <select
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            className="input-field w-full"
          >
            <option value="">Auto-Detect (Recommended)</option>
            {parsers.filter((p) => p.name !== 'generic').map((p) => (
              <option key={p.name} value={p.name}>{p.display_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Broker exclusions */}
      {brokers.length > 0 && (
        <div className="border-t border-[var(--border)] pt-6">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
            Broker Exclusions <span className="text-xs font-normal text-[var(--text-tertiary)]">(applies to this audit only)</span>
          </label>

          <div className="relative" ref={brokerDropdownRef}>
            <button
              onClick={() => setBrokerDropdownOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm hover:border-[var(--primary)] transition-colors duration-150"
            >
              <span className={excludedBrokers.size > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
                {excludedBrokers.size > 0
                  ? `${excludedBrokers.size} broker${excludedBrokers.size > 1 ? 's' : ''} excluded`
                  : 'No brokers excluded'}
              </span>
              <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-150 ${brokerDropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
            </button>

            {brokerDropdownOpen && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-[var(--border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-hidden">
                <div className="p-2 border-b border-[var(--border)]">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                    <input
                      type="text"
                      placeholder="Search brokers..."
                      value={brokerSearch}
                      onChange={(e) => setBrokerSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg)]">
                  <button
                    onClick={() => setExcludedBrokers(new Set(brokers))}
                    className="text-[11px] font-medium text-[var(--primary)] hover:underline"
                  >
                    Select all
                  </button>
                  <button
                    onClick={() => setExcludedBrokers(new Set())}
                    className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  >
                    Clear all
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto">
                  {brokers
                    .filter((b) => b.toLowerCase().includes(brokerSearch.toLowerCase()))
                    .map((broker) => {
                      const isExcluded = excludedBrokers.has(broker)
                      return (
                        <button
                          key={broker}
                          onClick={() => toggleBroker(broker)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150 ${
                            isExcluded ? 'bg-[var(--danger-subtle)] text-[var(--danger)]' : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <span className={`h-4 w-4 rounded-[var(--radius-sm)] border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                            isExcluded ? 'border-[var(--danger)] bg-[var(--danger)]' : 'border-[var(--border-strong)]'
                          }`}>
                            {isExcluded && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                          </span>
                          <span className="truncate">{broker}</span>
                        </button>
                      )
                    })}
                  {brokers.filter((b) => b.toLowerCase().includes(brokerSearch.toLowerCase())).length === 0 && (
                    <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                      No brokers match your search
                    </div>
                  )}
                </div>

                <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-tertiary)] text-center">
                  {excludedBrokers.size} of {brokers.length} excluded
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
