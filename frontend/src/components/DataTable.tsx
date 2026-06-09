import React, { useMemo, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArrowUpDown, ArrowUp, ArrowDown,
  CheckSquare, Square, MinusSquare,
  Loader2, FileText, AlertCircle,
} from 'lucide-react'
import type { Transaction } from '../types/api'
import type { AuditAnalytics } from '../utils/auditAnalytics'
import { getSuspiciousSubcategory } from '../utils/auditAnalytics'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { useSettingsStore } from '../stores/settingsStore'
import { TagBadgeList } from './TagBadge'
import { buildManualTagReason } from './TagDetailDialog'
import { addTag, removeTag, TRANSACTION_WARN_THRESHOLD } from '../lib/api'

const ROW_HEIGHT = 40

function money(v: number | null): string {
  if (v == null) return '–'
  const abs = Math.abs(v)
  return `₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function cleanCellText(value: string | null | undefined): string {
  return value ? value.replace(/\s+/g, ' ').trim() : ''
}

interface DataTableProps {
  analytics: AuditAnalytics
  isLoading: boolean
}

export const DataTable: React.FC<DataTableProps> = ({ analytics, isLoading }) => {
  const { selectedTransactionIds, selectTransaction, clearSelection, pushToast, resultFilter, setActiveTransaction, requestTagDetail } = useUIStore()
  const { refreshCurrentSession } = useSessionStore()
  const suspiciousThreshold = useSettingsStore((s) => (s.settings.suspicious_threshold as number) || 10000)

  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnSizing, setColumnSizing] = React.useState<Record<string, number>>({})

  // Smart sorting: for suspicious view group by subcategory, for recurring sort by person then date
  const transactions = useMemo(() => {
    const base = analytics.filteredTransactions
    if (resultFilter !== 'suspicious') return base

    return [...base].sort((a, b) => {
      const subA = getSuspiciousSubcategory(a, suspiciousThreshold)
      const subB = getSuspiciousSubcategory(b, suspiciousThreshold)

      const order: Record<string, number> = { recurring: 0, high_value: 1, other: 2 }
      if (order[subA] !== order[subB]) return order[subA] - order[subB]

      if (subA === 'recurring') {
        const nameA = (a.party_name || a.description || '').toLowerCase()
        const nameB = (b.party_name || b.description || '').toLowerCase()
        if (nameA !== nameB) return nameA.localeCompare(nameB)
        return (a.date || '').localeCompare(b.date || '')
      }

      if (subA === 'high_value') {
        return Math.abs(b.amount ?? 0) - Math.abs(a.amount ?? 0)
      }

      return (a.date || '').localeCompare(b.date || '')
    })
  }, [analytics.filteredTransactions, resultFilter, suspiciousThreshold])

  const parentRef = useRef<HTMLDivElement>(null)

  // Columns
  const columns = useMemo<ColumnDef<Transaction, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => {
          const allSelected = table.getRowModel().rows.every((row) =>
            selectedTransactionIds.includes(row.original.id)
          )
          const someSelected = table.getRowModel().rows.some((row) =>
            selectedTransactionIds.includes(row.original.id)
          )
          const Icon = allSelected ? CheckSquare : someSelected ? MinusSquare : Square

          return (
            <button
              onClick={() => {
                if (allSelected) {
                  clearSelection()
                } else {
                  const ids = table.getRowModel().rows.map((r) => r.original.id)
                  for (const id of ids) selectTransaction(id, true)
                }
              }}
              className="btn-icon p-0 text-[var(--text-tertiary)]"
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </button>
          )
        },
        cell: ({ row }) => {
          const isSelected = selectedTransactionIds.includes(row.original.id)
          const Icon = isSelected ? CheckSquare : Square
          return (
            <button
              onClick={(e) => {
                e.stopPropagation()
                selectTransaction(row.original.id, e.metaKey || e.ctrlKey || e.shiftKey)
              }}
              className="btn-icon p-0"
            >
              <Icon
                className={`h-4 w-4 ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-tertiary)]'}`}
                strokeWidth={1.5}
              />
            </button>
          )
        },
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableSorting: false,
        enableResizing: false,
      },
      {
        id: 'date',
        header: 'Date',
        accessorFn: (row) => cleanCellText(row.date),
        cell: ({ getValue }) => (
          <span className="text-[var(--text-secondary)] font-mono text-[12px] whitespace-nowrap">
            {cleanCellText(getValue() as string) || '–'}
          </span>
        ),
        size: 100,
        minSize: 70,
        maxSize: 160,
      },
      {
        id: 'description',
        header: 'Description',
        accessorFn: (row) => row.description || row.raw_text || '',
        cell: ({ row }) => {
          const desc = cleanCellText(row.original.description || row.original.raw_text) || '–'
          return (
            <div className="min-w-0">
              <div className="text-[13px] text-[var(--text-primary)] truncate" title={desc}>
                {desc}
              </div>
            </div>
          )
        },
        size: 320,
        minSize: 120,
        maxSize: 600,
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ getValue }) => {
          const v = getValue() as number | null
          const isDebit = v != null && v < 0
          const isCredit = v != null && v > 0
          return (
            <span
              className={`font-mono text-[13px] font-medium whitespace-nowrap ${
                isDebit ? 'text-[var(--danger)]' : isCredit ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'
              }`}
            >
              {money(v)}
            </span>
          )
        },
        size: 130,
        minSize: 80,
        maxSize: 200,
        sortingFn: 'basic',
      },
      {
        id: 'tags',
        header: 'Tags',
        cell: ({ row }) => (
          <TagBadgeList
            tags={row.original.tags}
            onRemoveTag={async (tagId) => {
              await removeTag(tagId)
              await refreshCurrentSession()
              pushToast({ message: 'Tag removed' })
            }}
            onCycleTag={async (tag) => {
              const types = ['client', 'broker', 'suspicious'] as const
              const idx = types.indexOf(tag.tag_type)
              const next = types[(idx + 1) % types.length]
              const result = await requestTagDetail({ tagType: next, scope: 'single' })
              if (!result) return
              await addTag(row.original.id, result.tagType, buildManualTagReason(result.tagType, result.detail), tag.confidence, 'manual', true)
              await refreshCurrentSession()
              pushToast({ message: `Tag changed to ${result.tagType}` })
            }}
            onAddTag={async () => {
              const result = await requestTagDetail({ tagType: null, scope: 'single' })
              if (!result) return
              await addTag(row.original.id, result.tagType, buildManualTagReason(result.tagType, result.detail), 1.0, 'manual', true)
              await refreshCurrentSession()
              pushToast({ message: `Tag added as ${result.tagType}` })
            }}
          />
        ),
        size: 100,
        minSize: 60,
        maxSize: 200,
        enableSorting: false,
        enableResizing: true,
      },
      {
        id: 'reason',
        header: 'Reason',
        accessorFn: (row) => {
          const tag = row.tags.find(t => t.reason)
          return tag?.reason || ''
        },
        cell: ({ row }) => {
          const reasons = row.original.tags
            .filter(t => t.reason)
            .map(t => t.reason!)
          if (reasons.length === 0) return <span className="text-[var(--text-tertiary)]">–</span>
          return (
            <span className="text-[12px] text-[var(--text-secondary)] truncate block" title={reasons.join('; ')}>
              {reasons[0]}
            </span>
          )
        },
        size: 180,
        minSize: 80,
        maxSize: 400,
      },
      {
        accessorKey: 'page_number',
        header: 'Page',
        cell: ({ getValue }) => (
          <span className="font-mono text-[12px] text-[var(--text-tertiary)]">
            {getValue() ?? '–'}
          </span>
        ),
        size: 60,
        minSize: 40,
        maxSize: 100,
      },
    ],
    [selectedTransactionIds, selectTransaction, clearSelection, refreshCurrentSession, pushToast, requestTagDetail]
  )

  const table = useReactTable({
    data: transactions,
    columns,
    state: { sorting, columnSizing },
    onSortingChange: setSorting,
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    columnResizeMode: 'onChange',
    enableColumnResizing: true,
  })

  const { rows } = table.getRowModel()
  const visibleColumns = table.getVisibleLeafColumns()
  const tableMinWidth = table.getTotalSize()
  const gridTemplateColumns = visibleColumns
    .map((column) => {
      const size = column.getSize()
      if (column.id === 'description') return `minmax(${size}px, 1.65fr)`
      if (column.id === 'reason') return `minmax(${size}px, 0.9fr)`
      return `${size}px`
    })
    .join(' ')
  const tableGridStyle = {
    display: 'grid',
    gridTemplateColumns,
    width: '100%',
    minWidth: `${tableMinWidth}px`,
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  })

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 mx-auto text-[var(--primary)] animate-spin mb-3" strokeWidth={1.5} />
          <p className="text-sm text-[var(--text-secondary)]">Loading transactions...</p>
        </div>
      </div>
    )
  }

  // Empty state
  if (transactions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-[var(--surface-inset)] mb-4">
            <FileText className="h-7 w-7 text-[var(--border-strong)]" strokeWidth={1} />
          </div>
          <p className="text-sm font-medium text-[var(--text-secondary)] mb-1">No transactions found</p>
          <p className="text-xs text-[var(--text-tertiary)]">Try adjusting your filters or search query</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[var(--surface)]">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border)] text-[11px] text-[var(--text-tertiary)] shrink-0">
        <span>
          {transactions.length.toLocaleString()} transactions
          {selectedTransactionIds.length > 0 && (
            <span className="text-[var(--primary)] font-medium ml-2">
              · {selectedTransactionIds.length} selected
            </span>
          )}
        </span>
        <span className="font-mono">
          {analytics.totals.tagged} tagged · {analytics.totals.untagged} untagged
        </span>
      </div>

      {/* Pagination warning banner */}
      {analytics.filteredTransactions.length >= TRANSACTION_WARN_THRESHOLD && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-[var(--warning-bg)] border-b border-[var(--warning)]/20 text-[11px] text-[var(--warning)] shrink-0">
          <AlertCircle className="h-3 w-3 shrink-0" strokeWidth={2} />
          <span>
            Large dataset ({analytics.filteredTransactions.length.toLocaleString()} rows). Use filters or search to narrow results for best performance.
          </span>
        </div>
      )}

      {/* Table header */}
      <div className="shrink-0 bg-[var(--surface)] border-b border-[var(--border)]">
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            key={headerGroup.id}
            className="items-center"
            style={tableGridStyle}
          >
            {headerGroup.headers.map((header, headerIndex) => {
              const canSort = header.column.getCanSort()
              const sorted = header.column.getIsSorted()
              const canResize = header.column.getCanResize()
              return (
                <div
                  key={header.id}
                  className="relative group min-w-0"
                  style={{ gridColumn: headerIndex + 1, overflow: 'hidden', textAlign: 'left' }}
                >
                  <div
                    className={`
                      flex items-center gap-1 px-3 py-2 text-[11px] font-semibold
                      uppercase tracking-wider text-[var(--text-tertiary)]
                      ${canSort ? 'cursor-pointer select-none hover:text-[var(--text-secondary)]' : ''}
                    `}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {canSort && (
                      <span className="shrink-0">
                        {sorted === 'asc' ? (
                          <ArrowUp className="h-3 w-3 text-[var(--primary)]" strokeWidth={2} />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="h-3 w-3 text-[var(--primary)]" strokeWidth={2} />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-40" strokeWidth={2} />
                        )}
                      </span>
                    )}
                  </div>
                  {/* Resize handle */}
                  {canResize && (
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`
                        absolute right-0 top-0 h-full w-[3px] cursor-col-resize
                        opacity-0 group-hover:opacity-100
                        transition-opacity duration-100
                        ${header.column.getIsResizing() ? '!opacity-100 bg-[var(--primary)]' : 'bg-[var(--border-strong)]'}
                      `}
                    />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
            minWidth: `${tableMinWidth}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index]
            const isSelected = selectedTransactionIds.includes(row.original.id)

            return (
              <div
                key={row.id}
                className={`
                  absolute left-0 items-center
                  border-b border-[var(--border-subtle)]
                  transition-colors duration-100 cursor-pointer
                  ${isSelected
                    ? 'bg-[var(--primary-bg)]'
                    : 'bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                  }
                `}
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'grid',
                  gridTemplateColumns,
                  width: '100%',
                  minWidth: `${tableMinWidth}px`,
                }}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    selectTransaction(row.original.id, true)
                  } else {
                    setActiveTransaction(row.original.id)
                  }
                }}
              >
                {row.getVisibleCells().map((cell, cellIndex) => (
                  <div
                    key={cell.id}
                    className="px-3 overflow-hidden min-w-0"
                    style={{ gridColumn: cellIndex + 1, textAlign: 'left' }}
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
}
