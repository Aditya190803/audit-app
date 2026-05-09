import React, { useMemo, useState, useRef, useEffect } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type VisibilityState
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, Columns, ChevronDown, Check } from 'lucide-react'
import type { Transaction } from '../types/api'
import { TagBadgeList } from './TagBadge'

interface DataTableProps {
  transactions: Transaction[]
  selectedIds: number[]
  onSelectTransaction: (id: number, multi?: boolean) => void
  onRemoveTag: (tagId: number) => void
  onAddTag: (transactionId: number, tagType: string) => void
  searchQuery: string
  filterTags: string[]
  minAmount: number | null
  maxAmount: number | null
}

const STORAGE_KEY = 'datatable_visible_columns'

function loadVisibility(): VisibilityState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveVisibility(state: VisibilityState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const ALL_COLUMNS = [
  { id: 'select', label: '', alwaysOn: true },
  { id: 'date', label: 'Date' },
  { id: 'description', label: 'Description' },
  { id: 'amount', label: 'Amount' },
  { id: 'tags', label: 'Tag' },
  { id: 'page_number', label: 'Page' },
]

export const DataTable: React.FC<DataTableProps> = ({
  transactions,
  selectedIds,
  onSelectTransaction,
  onRemoveTag,
  onAddTag,
  searchQuery,
  filterTags,
  minAmount,
  maxAmount
}) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadVisibility)
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) {
        setColsOpen(false)
      }
    }
    if (colsOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [colsOpen])

  const filteredData = useMemo(() => {
    return transactions.filter((tx) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const text = `${tx.party_name || ''} ${tx.description || ''} ${tx.date || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      if (filterTags.length > 0) {
        const txTags = tx.tags.map((t) => t.tag_type)
        if (!filterTags.some((ft) => txTags.includes(ft))) return false
      }
      if (minAmount !== null && tx.amount !== null && tx.amount < minAmount) return false
      if (maxAmount !== null && tx.amount !== null && tx.amount > maxAmount) return false
      return true
    })
  }, [transactions, searchQuery, filterTags, minAmount, maxAmount])

  const columns = useMemo<ColumnDef<Transaction>[]>(() => [
    {
      id: 'select',
      header: () => null,
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelectTransaction(row.original.id, true)
          }}
          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors duration-150"
        >
          {selectedIds.includes(row.original.id) ? (
            <CheckSquare className="h-4 w-4 text-[var(--primary)]" strokeWidth={2} />
          ) : (
            <Square className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      ),
      size: 40
    },
    {
      id: 'date',
      accessorKey: 'date',
      header: 'Date',
      cell: (info) => (
        <span className="text-sm text-[var(--text-secondary)] whitespace-nowrap font-mono">
          {info.getValue() as string || '-'}
        </span>
      ),
      size: 100
    },
    {
      id: 'description',
      accessorKey: 'party_name',
      header: 'Description',
      cell: (info) => {
        const tx = info.row.original
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {tx.party_name || tx.description || '-'}
            </p>
            {tx.description && tx.party_name && tx.description !== tx.party_name && (
              <p className="text-xs text-[var(--text-tertiary)] truncate">{tx.description}</p>
            )}
          </div>
        )
      },
      size: 320
    },
    {
      id: 'amount',
      accessorKey: 'amount',
      header: ({ column }) => (
        <button
          onClick={() => column.toggleSorting()}
          className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors duration-150"
        >
          Amount
          {column.getIsSorted() === 'asc' ? <ArrowUp className="h-3 w-3" strokeWidth={2} /> : column.getIsSorted() === 'desc' ? <ArrowDown className="h-3 w-3" strokeWidth={2} /> : <ArrowUpDown className="h-3 w-3" strokeWidth={1.5} />}
        </button>
      ),
      cell: (info) => {
        const val = info.getValue() as number | null
        if (val === null) return <span className="text-sm text-[var(--text-tertiary)]">-</span>
        const color = val < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'
        return <span className={`text-sm font-mono font-medium ${color}`}>₹{Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      },
      size: 140
    },
    {
      id: 'tags',
      accessorKey: 'tags',
      header: () => <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Tag</span>,
      cell: (info) => {
        const tx = info.row.original
        return (
          <div className="flex items-center gap-2 min-w-0">
            <TagBadgeList tags={tx.tags} onRemoveTag={onRemoveTag} />
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              {(['client', 'broker', 'suspicious'] as const).map((t) => (
                <button
                  key={t}
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddTag(tx.id, t)
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] hover:bg-[var(--border)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors duration-150"
                  title={`Tag as ${t}`}
                >
                  {t[0].toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        )
      },
      size: 160
    },
    {
      id: 'page_number',
      accessorKey: 'page_number',
      header: 'Page',
      cell: (info) => (
        <span className="text-xs text-[var(--text-tertiary)] font-mono">
          {info.getValue() != null ? String(info.getValue()) : '-'}
        </span>
      ),
      size: 60
    }
  ], [selectedIds, onSelectTransaction, onRemoveTag, onAddTag])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(updater)
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      saveVisibility(next)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  if (filteredData.length === 0 && transactions.length > 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-[var(--text-secondary)]">No transactions match the current filters.</p>
        </div>
      </div>
    )
  }

  const visibleCount = ALL_COLUMNS.filter(c => c.alwaysOn || columnVisibility[c.id] !== false).length

  return (
    <div className="h-full flex flex-col">
      {/* Column visibility toolbar */}
      <div className="flex items-center justify-end px-3 py-1.5 border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="relative" ref={colsRef}>
          <button
            onClick={() => setColsOpen(o => !o)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Columns className="h-3.5 w-3.5" strokeWidth={1.5} />
            Columns
            <ChevronDown className={`h-3 w-3 transition-transform ${colsOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
          </button>
          {colsOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] bg-white border border-[var(--border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-hidden">
              {ALL_COLUMNS.filter(c => !c.alwaysOn).map((col) => {
                const isVisible = columnVisibility[col.id] !== false
                return (
                  <button
                    key={col.id}
                    onClick={() => {
                      setColumnVisibility(prev => {
                        const next = { ...prev, [col.id]: !isVisible }
                        saveVisibility(next)
                        return next
                      })
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150 ${
                      isVisible ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'
                    } hover:bg-[var(--surface-hover)]`}
                  >
                    <span className={`h-4 w-4 rounded-[var(--radius-sm)] border flex items-center justify-center shrink-0 transition-colors ${
                      isVisible ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-strong)]'
                    }`}>
                      {isVisible && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                    </span>
                    {col.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-[var(--border)]">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap"
                    style={{ width: header.getSize() }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onSelectTransaction(row.original.id)}
                className={`group cursor-pointer transition-colors duration-150 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                  selectedIds.includes(row.original.id) ? 'bg-[var(--primary-subtle)]' : 'hover:bg-[var(--surface-hover)]'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
