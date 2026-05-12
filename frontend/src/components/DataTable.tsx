import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
  type VisibilityState
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, Columns, ChevronDown, Check, StickyNote, Flag } from 'lucide-react'
import type { Tag, Transaction } from '../types/api'
import { formatTagReason, TagBadgeList } from './TagBadge'
import { updateReviewStatus, updateNotes } from '../lib/api'

interface DataTableProps {
  transactions: Transaction[]
  selectedIds: number[]
  onSelectTransaction: (id: number, multi?: boolean) => void
  onRemoveTag: (tagId: number) => void
  onAddTag: (transactionId: number, tagType: Tag['tag_type']) => void
  searchQuery: string
  filterTags: string[]
  minAmount: number | null
  maxAmount: number | null
  sessionId?: number | null
}

function storageKey(sessionId?: number | null): string {
  return sessionId ? `datatable_visible_columns_${sessionId}` : 'datatable_visible_columns'
}

function loadVisibility(sessionId?: number | null): VisibilityState {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveVisibility(state: VisibilityState, sessionId?: number | null) {
  localStorage.setItem(storageKey(sessionId), JSON.stringify(state))
}

const ALL_COLUMNS = [
  { id: 'select', label: '', alwaysOn: true },
  { id: 'date', label: 'Date' },
  { id: 'description', label: 'Description' },
  { id: 'amount', label: 'Amount' },
  { id: 'payment_method', label: 'Method' },
  { id: 'tags', label: 'Tag' },
  { id: 'reason', label: 'Reason' },
  { id: 'page_number', label: 'Page' },
  { id: 'pdf_filename', label: 'PDF' },
  { id: 'actions', label: 'Actions' },
]

export const DataTable: React.FC<DataTableProps> = React.memo(({
  transactions,
  selectedIds,
  onSelectTransaction,
  onRemoveTag,
  onAddTag,
  searchQuery,
  filterTags,
  minAmount,
  maxAmount,
  sessionId,
}) => {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => loadVisibility(sessionId))
  const [colsOpen, setColsOpen] = useState(false)
  const colsRef = useRef<HTMLDivElement>(null)
  const lastClickedId = useRef<number | null>(null)
  const tableContainerRef = useRef<HTMLDivElement>(null)
  const selectedIdsRef = useRef(selectedIds)
  selectedIdsRef.current = selectedIds

  function hasTextSelectionWithinRow(rowElement: HTMLElement) {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false

    const { anchorNode, focusNode } = selection
    return Boolean(
      (anchorNode && rowElement.contains(anchorNode)) ||
      (focusNode && rowElement.contains(focusNode))
    )
  }

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
        if (!filterTags.some((ft) => txTags.some((tag) => tag === ft))) return false
      }
      if (minAmount !== null && tx.amount !== null && tx.amount < minAmount) return false
      if (maxAmount !== null && tx.amount !== null && tx.amount > maxAmount) return false
      return true
    })
  }, [transactions, searchQuery, filterTags, minAmount, maxAmount])

  const handleCycleTag = useCallback((tag: Tag) => {
    const cycle: Record<string, string | null> = { client: 'broker', broker: 'suspicious', suspicious: null }
    const next = cycle[tag.tag_type]
    if (next) {
      onAddTag(tag.transaction_id, next as Tag['tag_type'])
    } else {
      onRemoveTag(tag.id)
    }
  }, [onAddTag, onRemoveTag])

  const columns = useMemo<ColumnDef<Transaction>[]>(() => [
    {
      id: 'select',
      header: () => null,
      cell: ({ row }) => (
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (e.shiftKey && lastClickedId.current !== null) {
              const rows = table.getRowModel().rows
              const currentIdx = rows.findIndex((r) => r.original.id === row.original.id)
              const lastIdx = rows.findIndex((r) => r.original.id === lastClickedId.current)
              if (currentIdx !== -1 && lastIdx !== -1) {
                const [start, end] = currentIdx > lastIdx ? [lastIdx, currentIdx] : [currentIdx, lastIdx]
                for (let i = start; i <= end; i++) {
                  onSelectTransaction(rows[i].original.id, true)
                }
              }
            } else {
              onSelectTransaction(row.original.id, true)
            }
            lastClickedId.current = row.original.id
          }}
          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors duration-150"
        >
          {selectedIdsRef.current.includes(row.original.id) ? (
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
          <div className="min-w-[360px] max-w-[680px]">
            <p className="text-sm text-[var(--text-primary)] leading-5 truncate" title={tx.description || tx.raw_text || tx.party_name || '-'}>
              {tx.description || tx.raw_text || tx.party_name || '-'}
            </p>
          </div>
        )
      },
      size: 420
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
      id: 'payment_method',
      accessorKey: 'payment_method',
      header: () => <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Method</span>,
      cell: (info) => {
        const val = info.getValue() as string | null
        if (!val || val === 'OTHER') return <span className="text-xs text-[var(--text-tertiary)]">-</span>
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-sm)] text-[var(--text-secondary)]">
            {val}
          </span>
        )
      },
      size: 70
    },
    {
      id: 'tags',
      accessorKey: 'tags',
      header: () => <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Tag</span>,
      cell: (info) => {
        const tx = info.row.original
        return (
          <div className="flex items-center gap-2 min-w-0">
            <TagBadgeList tags={tx.tags} onRemoveTag={onRemoveTag} onCycleTag={handleCycleTag} />
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
      id: 'reason',
      accessorFn: (row) => row.tags?.[0]?.reason || '',
      header: () => <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Reason</span>,
      cell: (info) => {
        const tag = info.row.original.tags?.[0]
        if (!tag) {
          return <span className="text-xs text-[var(--text-tertiary)]">-</span>
        }
        return (
          <p className="max-w-[280px] text-xs leading-5 text-[var(--text-secondary)] whitespace-normal break-words">
            {formatTagReason(tag)}
          </p>
        )
      },
      size: 280
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
    },
    {
      id: 'pdf_filename',
      accessorKey: 'pdf_filename',
      header: () => <span className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">PDF</span>,
      cell: (info) => {
        const val = info.getValue() as string | null
        if (!val) return <span className="text-xs text-[var(--text-tertiary)]">-</span>
        const short = val.length > 20 ? val.slice(0, 17) + '...' : val
        return <span className="text-[10px] text-[var(--text-tertiary)] font-mono truncate max-w-[80px] block" title={val}>{short}</span>
      },
      size: 90
    },
    {
      id: 'actions',
      header: () => null,
      cell: ({ row }) => {
        const tx = row.original
        const status = tx.review_status || 'unreviewed'
        return (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => {
                e.stopPropagation()
                const next = status === 'unreviewed' ? 'reviewed' : status === 'reviewed' ? 'flagged' : 'unreviewed'
                updateReviewStatus(tx.id, next)
              }}
              className={`p-1 rounded-[var(--radius-sm)] transition-colors ${
                status === 'flagged'
                  ? 'text-[var(--danger)] bg-[var(--danger-subtle)]'
                  : status === 'reviewed'
                  ? 'text-[var(--success)] bg-[var(--success-subtle)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
              title={`Review status: ${status}`}
            >
              <Flag className="h-3 w-3" strokeWidth={2} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                const current = tx.user_notes || ''
                const notes = window.prompt('Add notes:', current)
                if (notes !== null) {
                  updateNotes(tx.id, notes)
                }
              }}
              className={`p-1 rounded-[var(--radius-sm)] transition-colors ${
                tx.user_notes
                  ? 'text-[var(--primary)] bg-[var(--primary-subtle)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
              }`}
              title={tx.user_notes || 'Add notes'}
            >
              <StickyNote className="h-3 w-3" strokeWidth={2} />
            </button>
          </div>
        )
      },
      size: 60
    }
  ], [onSelectTransaction, onRemoveTag, onAddTag])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: (updater) => {
      setColumnVisibility(updater)
      const next = typeof updater === 'function' ? updater(columnVisibility) : updater
      saveVisibility(next, sessionId)
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  })

  const rowVirtualizer = useVirtualizer({
    count: table.getRowModel().rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48,
    overscan: 5,
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
                        saveVisibility(next, sessionId)
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

      <div ref={tableContainerRef} className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[var(--surface)]">
          {table.getHeaderGroups().map((hg) => (
            <div key={hg.id} className="flex border-b border-[var(--border)]">
              {hg.headers.map((header) => (
                <div
                  key={header.id}
                  className="px-3 py-2.5 text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap shrink-0"
                  style={{ width: header.getSize() }}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Virtualized body */}
        <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative', contain: 'layout style' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = table.getRowModel().rows[virtualRow.index]
            const isSelected = selectedIdsRef.current.includes(row.original.id)
            return (
              <div
                key={row.id}
                data-index={virtualRow.index}
                onClick={(e) => {
                  if (hasTextSelectionWithinRow(e.currentTarget)) return
                  onSelectTransaction(row.original.id)
                }}
                className={`group flex cursor-pointer border-b border-[var(--border)] ${
                  isSelected ? 'bg-[var(--primary-subtle)]' : 'hover:bg-[var(--surface-hover)]'
                }`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <div
                    key={cell.id}
                    className="px-3 py-2 shrink-0"
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
})
