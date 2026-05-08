import React, { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type SortingState,
  type ColumnDef
} from '@tanstack/react-table'
import { ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square } from 'lucide-react'
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
      if (minAmount !== null && tx.amount !== null && Math.abs(tx.amount) < minAmount) return false
      if (maxAmount !== null && tx.amount !== null && Math.abs(tx.amount) > maxAmount) return false
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
    }
  ], [selectedIds, onSelectTransaction, onRemoveTag, onAddTag])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
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

  return (
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
  )
}
