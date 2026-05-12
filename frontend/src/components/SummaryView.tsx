import React, { useState, useMemo } from 'react'
import { Users, Building2, AlertTriangle, HelpCircle, ChevronRight, ChevronDown, Search } from 'lucide-react'
import type { AuditAnalytics } from '../utils/auditAnalytics'
import type { Transaction } from '../types/api'
import { TagBadgeList } from './TagBadge'

function money(v: number | null | undefined): string {
  if (v == null) return '–'
  const abs = Math.abs(v)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(2)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(2)}L`
  return `₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

interface SummaryViewProps {
  analytics: AuditAnalytics
  onFilterChange?: (key: string, value: string) => void
}

type GroupKey = 'client' | 'broker' | 'suspicious' | 'untagged'

interface GroupMeta {
  key: GroupKey
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  count: number
  debit: number
  credit: number
  txns: Transaction[]
}

function buildGroups(analytics: AuditAnalytics): GroupMeta[] {
  const all = analytics.filteredTransactions
  const client = all.filter((t) => t.tags.some((tag) => tag.tag_type === 'client'))
  const broker = all.filter((t) => t.tags.some((tag) => tag.tag_type === 'broker'))
  const suspicious = all.filter((t) => t.tags.some((tag) => tag.tag_type === 'suspicious'))
  const untagged = all.filter((t) => t.tags.length === 0)

  const groups: GroupMeta[] = [
    {
      key: 'client',
      label: 'Client',
      icon: <Users className="h-4 w-4" strokeWidth={1.5} />,
      color: 'var(--success)',
      bg: 'var(--success-subtle)',
      count: client.length,
      debit: client.reduce((s, t) => s + Math.min((t.amount ?? 0), 0), 0),
      credit: client.reduce((s, t) => s + Math.max((t.amount ?? 0), 0), 0),
      txns: client,
    },
    {
      key: 'broker',
      label: 'Broker',
      icon: <Building2 className="h-4 w-4" strokeWidth={1.5} />,
      color: 'var(--warning)',
      bg: 'var(--warning-subtle)',
      count: broker.length,
      debit: broker.reduce((s, t) => s + Math.min((t.amount ?? 0), 0), 0),
      credit: broker.reduce((s, t) => s + Math.max((t.amount ?? 0), 0), 0),
      txns: broker,
    },
    {
      key: 'suspicious',
      label: 'Suspicious',
      icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />,
      color: 'var(--danger)',
      bg: 'var(--danger-subtle)',
      count: suspicious.length,
      debit: suspicious.reduce((s, t) => s + Math.min((t.amount ?? 0), 0), 0),
      credit: suspicious.reduce((s, t) => s + Math.max((t.amount ?? 0), 0), 0),
      txns: suspicious,
    },
    {
      key: 'untagged',
      label: 'Untagged',
      icon: <HelpCircle className="h-4 w-4" strokeWidth={1.5} />,
      color: 'var(--text-tertiary)',
      bg: 'var(--surface-hover)',
      count: untagged.length,
      debit: untagged.reduce((s, t) => s + Math.min((t.amount ?? 0), 0), 0),
      credit: untagged.reduce((s, t) => s + Math.max((t.amount ?? 0), 0), 0),
      txns: untagged,
    },
  ]
  return groups.filter((g) => g.count > 0)
}

function txDisplayName(tx: Transaction): string {
  return tx.description || tx.raw_text || tx.party_name || tx.date || `#${tx.id}`
}

export const SummaryView: React.FC<SummaryViewProps> = ({ analytics, onFilterChange }) => {
  const groups = useMemo(() => buildGroups(analytics), [analytics])
  const [expanded, setExpanded] = useState<GroupKey | null>(null)
  const [groupSearch, setGroupSearch] = useState('')

  const toggleGroup = (key: GroupKey) => {
    setExpanded(expanded === key ? null : key)
  }

  const viewAllInDataTable = (key: string, value: string) => {
    onFilterChange?.(key, value)
  }

  return (
    <div className="px-3 pb-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-secondary)]">
          Transactions grouped by tag type — {analytics.filteredTransactions.length} total
        </p>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <input
            type="text"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-40 pl-7 pr-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
          />
        </div>
      </div>

      {groups.length === 0 && (
        <div className="flex items-center justify-center py-10 text-sm text-[var(--text-tertiary)]">
          No transactions to review
        </div>
      )}

      <div className="space-y-2">
        {groups.map((group) => {
          if (groupSearch && !group.label.toLowerCase().includes(groupSearch.toLowerCase())) return null
          const isOpen = expanded === group.key
          return (
            <div
              key={group.key}
              className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden"
            >
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--surface-hover)] transition-colors duration-150 text-left"
              >
                <div className="p-1.5 rounded-md" style={{ backgroundColor: group.bg, color: group.color }}>
                  {group.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{group.label}</span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded-[var(--radius-sm)]"
                      style={{ backgroundColor: group.bg, color: group.color }}
                    >
                      {group.count} txns
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-[11px] text-[var(--danger)] font-mono">
                      {money(group.debit)} debit
                    </span>
                    <span className="text-[11px] text-[var(--success)] font-mono">
                      {money(group.credit)} credit
                    </span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (group.key === 'untagged') {
                      viewAllInDataTable('exception', 'untagged')
                    } else {
                      viewAllInDataTable('resultFilter', group.key)
                    }
                  }}
                  className="px-2.5 py-1 text-[10px] font-medium rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors shrink-0"
                >
                  View in table
                </button>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" strokeWidth={2} />
                )}
              </button>

              {/* Expanded transactions */}
              {isOpen && (
                <div className="border-t border-[var(--border)]">
                  {group.txns.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">
                      No transactions in this group
                    </div>
                  ) : (
                    <div className="max-h-[400px] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                            <th className="px-3 py-2 text-left font-medium text-[var(--text-tertiary)]">Date</th>
                            <th className="px-3 py-2 text-left font-medium text-[var(--text-tertiary)]">Party</th>
                            <th className="px-3 py-2 text-right font-medium text-[var(--text-tertiary)]">Amount</th>
                            <th className="px-3 py-2 text-left font-medium text-[var(--text-tertiary)]">Tag</th>
                            <th className="px-3 py-2 text-left font-medium text-[var(--text-tertiary)]">Page</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.txns.map((tx) => (
                            <tr
                              key={tx.id}
                              className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors"
                            >
                              <td className="px-3 py-2 text-[var(--text-secondary)] font-mono whitespace-nowrap">
                                {tx.date || '–'}
                              </td>
                              <td className="px-3 py-2 text-[var(--text-primary)] max-w-[240px] truncate" title={txDisplayName(tx)}>
                                {txDisplayName(tx)}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono font-medium ${(tx.amount ?? 0) < 0 ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>
                                {tx.amount != null ? `₹${Math.abs(tx.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '–'}
                              </td>
                              <td className="px-3 py-2">
                                <TagBadgeList tags={tx.tags} />
                              </td>
                              <td className="px-3 py-2 text-[var(--text-tertiary)] font-mono">
                                {tx.page_number ?? '–'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
