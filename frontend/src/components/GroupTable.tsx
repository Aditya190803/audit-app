import React, { useState } from 'react'
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
} from 'lucide-react'
import type { AuditGroup } from '../utils/auditAnalytics'

type SortKey = 'count' | 'debit' | 'credit' | 'net' | 'suspicious'
type SortDir = 'asc' | 'desc'

function moneyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`
  return `₹${abs.toLocaleString('en-IN')}`
}

interface GroupTableProps {
  groups: AuditGroup[]
  selectedKey?: string
  onSelect: (group: AuditGroup) => void
  onClearSelection?: () => void
  label?: string
  emptyMessage?: string
}

export const GroupTable: React.FC<GroupTableProps> = ({
  groups,
  selectedKey,
  onSelect,
  onClearSelection,
  label = 'Results',
  emptyMessage = 'No results match the filters.',
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('count')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...groups].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const av = a[sortKey]
    const bv = b[sortKey]
    if (av === bv) {
      return dir * ((b.debit + b.credit) - (a.debit + a.credit))
    }
    return dir * (av - bv)
  })

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" strokeWidth={1.5} />
    return sortDir === 'desc'
      ? <ArrowDown className="h-3 w-3 text-[var(--primary)]" strokeWidth={2} />
      : <ArrowUp className="h-3 w-3 text-[var(--primary)]" strokeWidth={2} />
  }

  const selectedGroup = selectedKey ? groups.find((g) => g.key === selectedKey) : undefined

  return (
    <div className="flex flex-col h-full">
      {/* Selection chip */}
      {selectedGroup && onClearSelection && (
        <div className="px-3 py-1.5 flex items-center gap-2 border-b border-[var(--border)] bg-[var(--primary-subtle)]">
          <span className="text-xs text-[var(--primary)] font-medium">Filtered by:</span>
          <span className="text-xs text-[var(--text-primary)] font-semibold">{selectedGroup.name}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">({selectedGroup.count} txns)</span>
          <button
            onClick={onClearSelection}
            className="ml-auto p-0.5 hover:bg-[var(--primary)]/10 rounded-full transition-colors"
          >
            <X className="h-3 w-3 text-[var(--primary)]" strokeWidth={2.5} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[var(--surface)] z-10">
            <tr className="text-left text-[11px] text-[var(--text-tertiary)]">
              {([
                { key: 'name' as const, label: 'Name', align: 'left' },
                { key: 'count' as SortKey, label: 'Txns', align: 'right' },
                { key: 'debit' as SortKey, label: 'Debit', align: 'right' },
                { key: 'credit' as SortKey, label: 'Credit', align: 'right' },
                { key: 'net' as SortKey, label: 'Net', align: 'right' },
                { key: 'suspicious' as SortKey, label: 'Susp.', align: 'right' },
              ] as const).map((col) => (
                <th
                  key={col.key}
                  className={`px-3 py-2 font-medium ${col.align === 'right' ? 'text-right' : ''} ${col.key !== 'name' ? 'cursor-pointer select-none hover:text-[var(--text-secondary)]' : ''}`}
                  onClick={col.key !== 'name' ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.key !== 'name' && <SortIcon col={col.key} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((group) => {
              const isSelected = selectedKey === group.key
              return (
                <tr
                  key={group.key}
                  onClick={() => onSelect(group)}
                  className={`border-t border-[var(--border)] cursor-pointer transition-colors duration-100 ${
                    isSelected
                      ? 'bg-[var(--primary-subtle)] border-l-2 border-l-[var(--primary)]'
                      : 'hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`font-medium block truncate max-w-[180px] ${isSelected ? 'text-[var(--primary)]' : 'text-[var(--text-primary)]'}`}
                        title={group.name}
                      >
                        {group.name}
                      </span>
                      {group.broker > 0 && (
                        <span className="shrink-0 inline-flex items-center px-1 py-0.5 text-[9px] font-medium bg-[var(--warning-subtle)] text-[var(--warning)] rounded-[var(--radius-sm)] border border-[var(--warning)]/20">
                          Broker
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{group.count}</td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--danger)]">{moneyShort(group.debit)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[var(--success)]">{moneyShort(group.credit)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${group.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                    {moneyShort(group.net)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {group.suspicious > 0 ? (
                      <span className="text-[var(--danger)] font-semibold">{group.suspicious}</span>
                    ) : (
                      <span className="text-[var(--text-tertiary)]">0</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {groups.length === 0 && (
        <div className="px-3 py-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">{emptyMessage}</p>
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="mt-2 text-xs text-[var(--primary)] hover:underline"
            >
              Clear filters to see all results
            </button>
          )}
        </div>
      )}

      {/* Footer count */}
      {groups.length > 0 && (
        <div className="px-3 py-1.5 border-t border-[var(--border)] text-[10px] text-[var(--text-tertiary)] text-right">
          {groups.length} {label.toLowerCase()} · sorted by {sortKey} {sortDir === 'desc' ? 'descending' : 'ascending'}
        </div>
      )}
    </div>
  )
}
