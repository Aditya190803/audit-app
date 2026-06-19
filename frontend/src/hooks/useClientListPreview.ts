import { useState, useCallback, useEffect } from 'react'
import * as XLSX from 'xlsx-js-style'

// ── Constants ──────────────────────────────────────────────────────────────────

const COMMON_NAME_COLUMNS = [
  'name', 'client_name', 'client name', 'customer_name', 'customer name',
  'party_name', 'party name', 'account_name', 'account name', 'client',
  'customer', 'party', 'beneficiary', 'payee', 'drawer'
]

const AP_CODE_KEYWORDS = ['ap code', 'ap_code', 'apcode', 'ap codes', 'ap_codes', 'apcodes']

// ── Helpers ────────────────────────────────────────────────────────────────────

export function isExcel(file: File): boolean {
  return file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel'
}

export function isCsv(file: File): boolean {
  return file.name.endsWith('.csv') || file.type === 'text/csv'
}

export function bestApCodeColumnMatch(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, '_'))
  for (const candidate of AP_CODE_KEYWORDS) {
    const candNorm = candidate.toLowerCase().replace(/[_\s]+/g, '_')
    const exact = normalized.findIndex((h) => h === candNorm)
    if (exact !== -1) return headers[exact]
    const includes = normalized.findIndex((h) => h.includes(candNorm))
    if (includes !== -1) return headers[includes]
  }
  return null
}

function bestNameColumnMatch(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, '_'))
  for (const candidate of COMMON_NAME_COLUMNS) {
    const candNorm = candidate.toLowerCase().replace(/[_\s]+/g, '_')
    const exact = normalized.findIndex((h) => h === candNorm)
    if (exact !== -1) return headers[exact]
    const includes = normalized.findIndex((h) => h.includes(candNorm))
    if (includes !== -1) return headers[includes]
  }
  return null
}

export function rowToStringArray(row: unknown[]): string[] {
  return row.map((v) => String(v ?? '').trim())
}

export function rowsToObjects(rows: unknown[][], headerRow: number, generatedColumns: string[]): Record<string, unknown>[] {
  if (rows.length === 0) return []
  const useGenerated = headerRow === -1
  const dataStart = useGenerated ? 0 : headerRow + 1
  const headers = useGenerated ? generatedColumns : rowToStringArray(rows[headerRow] ?? []).filter(Boolean)
  return rows.slice(dataStart).map((row) => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { obj[h] = (row as unknown[])[i] })
    return obj
  })
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useClientListPreview() {
  const [clientListFile, setClientListFile] = useState<File | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [headerRow, setHeaderRow] = useState<number>(0)
  const [csvFirstRows, setCsvFirstRows] = useState<string[][]>([])
  const [nameColumn, setNameColumn] = useState('')
  const [detectedColumns, setDetectedColumns] = useState<string[]>([])
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null)

  // Reset all state when a new client list file is selected
  const selectClientListFile = useCallback((file: File) => {
    setClientListFile(file)
    setSheetName('')
    setSheetNames([])
    setNameColumn('')
    setDetectedColumns([])
    setCsvFirstRows([])
    setHeaderRow(0)
    setExcelWorkbook(null)
  }, [])

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
        try {
          const text = String(e.target?.result || '')
          const workbook = XLSX.read(text, { type: 'string' })
          const ws = workbook.Sheets[workbook.SheetNames[0]]
          const rows = ws ? XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][] : []
          setCsvFirstRows(rows.slice(0, 10).map(rowToStringArray))
        } catch (error) {
          console.error('[FileDropZone] Failed to parse CSV headers:', error)
          setCsvFirstRows([])
          setDetectedColumns([])
        }
      }
      reader.readAsText(clientListFile)
      return
    }

    if (isExcel(clientListFile)) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          setExcelWorkbook(workbook)
          const sheets = workbook.SheetNames
          setSheetNames(sheets)

          if (sheets.length > 0) {
            const firstSheet = sheets[0]
            setSheetName(firstSheet)
            const ws = workbook.Sheets[firstSheet]
            const headers = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
            if (headers.length > 0) {
              const cols = rowToStringArray(headers[0]).filter(Boolean)
              setDetectedColumns(cols)
              const best = bestNameColumnMatch(cols)
              if (best) setNameColumn(best)
            }
          }
        } catch (error) {
          console.error('[FileDropZone] Failed to parse Excel client list:', error)
          setExcelWorkbook(null)
          setSheetNames([])
          setDetectedColumns([])
        }
      }
      reader.onerror = () => {
        console.error('[FileDropZone] Failed to read Excel client list.')
        setSheetNames([])
        setDetectedColumns([])
      }
      reader.readAsArrayBuffer(clientListFile)
    }
  }, [clientListFile])

  return {
    clientListFile, selectClientListFile,
    sheetNames, sheetName, setSheetName,
    headerRow, setHeaderRow,
    csvFirstRows,
    detectedColumns, nameColumn, setNameColumn,
    excelWorkbook,
  }
}
