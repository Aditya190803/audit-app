import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx-js-style'
import { bestApCodeColumnMatch, isExcel, rowsToObjects } from './useClientListPreview'

interface UseApCodeSelectionParams {
  clientListFile: File | null
  detectedColumns: string[]
  excelWorkbook: XLSX.WorkBook | null
  sheetName: string
  headerRow: number
}

export function useApCodeSelection({
  clientListFile,
  detectedColumns,
  excelWorkbook,
  sheetName,
  headerRow,
}: UseApCodeSelectionParams) {
  const [apCodeEnabled, setApCodeEnabled] = useState(true)
  const [apCodeColumn, setApCodeColumn] = useState('')
  const [availableApCodes, setAvailableApCodes] = useState<string[]>([])
  const [selectedApCodes, setSelectedApCodes] = useState<Set<string>>(new Set())
  const [apCodeDropdownOpen, setApCodeDropdownOpen] = useState(false)
  const [apCodeSearch, setApCodeSearch] = useState('')
  const [apCodeLoading, setApCodeLoading] = useState(false)
  const apCodeDropdownRef = useRef<HTMLDivElement>(null)

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
            const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
            rows = rowsToObjects(rawRows, headerRow, detectedColumns)
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
        if (!cancelled) setAvailableApCodes([])
      } finally {
        if (!cancelled) setApCodeLoading(false)
      }
    }
    fn()
    return () => { cancelled = true }
  }, [clientListFile, apCodeColumn, sheetName, apCodeEnabled, excelWorkbook, headerRow, detectedColumns])

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

  return {
    apCodeEnabled, setApCodeEnabled,
    apCodeColumn, setApCodeColumn,
    availableApCodes,
    selectedApCodes, setSelectedApCodes,
    apCodeDropdownOpen, setApCodeDropdownOpen,
    apCodeSearch, setApCodeSearch,
    apCodeLoading,
    apCodeDropdownRef,
  }
}
