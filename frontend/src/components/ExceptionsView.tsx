import React from 'react'
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react'
import type { AdvancedFilters, AuditAnalytics } from '../utils/auditAnalytics'

interface ExceptionsViewProps {
  analytics: AuditAnalytics
  onFilterChange: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
}

const SEVERITY_GROUPS = [
  {
    key: 'high' as const,
    label: 'High Risk',
    icon: <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--danger)',
    bg: 'var(--danger-subtle)',
    border: 'var(--danger)',
    items: [
      { key: 'high_value' as AdvancedFilters['exception'], label: 'High value', getCount: (a: AuditAnalytics) => a.exceptions.highValue },
      { key: 'missing_party' as AdvancedFilters['exception'], label: 'Missing party', getCount: (a: AuditAnalytics) => a.exceptions.missingParty },
    ],
  },
  {
    key: 'medium' as const,
    label: 'Medium Risk',
    icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--warning)',
    bg: 'var(--warning-subtle)',
    border: 'var(--warning)',
    items: [
      { key: 'repeat' as AdvancedFilters['exception'], label: 'Repeat parties', getCount: (a: AuditAnalytics) => a.exceptions.repeat },
      { key: 'cash' as AdvancedFilters['exception'], label: 'Cash transactions', getCount: (a: AuditAnalytics) => a.exceptions.cash },
      { key: 'same_day' as AdvancedFilters['exception'], label: 'Same-day repeats', getCount: (a: AuditAnalytics) => a.exceptions.sameDay },
    ],
  },
  {
    key: 'low' as const,
    label: 'Review Needed',
    icon: <Info className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--text-secondary)',
    bg: 'var(--surface-hover)',
    border: 'var(--border-strong)',
    items: [
      { key: 'untagged' as AdvancedFilters['exception'], label: 'Untagged', getCount: (a: AuditAnalytics) => a.exceptions.untagged },
      { key: 'low_confidence' as AdvancedFilters['exception'], label: 'Low confidence', getCount: (a: AuditAnalytics) => a.exceptions.lowConfidence },
    ],
  },
]

export const ExceptionsView: React.FC<ExceptionsViewProps> = ({
  analytics,
  onFilterChange,
}) => {
  const totalExceptions = Object.values(analytics.exceptions).reduce((a, b) => a + b, 0)

  return (
    <div className="px-3 pb-3 space-y-3">
      {/* Overall bar */}
      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span className="font-medium">{totalExceptions} exceptions found</span>
        <span className="opacity-30">|</span>
        <span>Click any card to filter transactions</span>
      </div>

      {SEVERITY_GROUPS.map((group) => {
        const groupTotal = group.items.reduce((sum, item) => sum + item.getCount(analytics), 0)
        return (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="flex items-center gap-1.5 px-2 py-0.5 rounded-[var(--radius-sm)] text-xs font-medium"
                style={{ color: group.color, backgroundColor: group.bg }}
              >
                {group.icon}
                {group.label}
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)]">{groupTotal} items</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {group.items.map((item) => {
                const count = item.getCount(analytics)
                const pct = totalExceptions > 0 ? Math.round((count / totalExceptions) * 100) : 0
                return (
                  <button
                    key={item.key}
                    onClick={() => onFilterChange('exception', item.key)}
                    className="group relative overflow-hidden text-left p-3 bg-white border border-[var(--border)] rounded-[var(--radius-md)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)] transition-all duration-150"
                  >
                    {/* Severity indicator strip */}
                    <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: group.color, opacity: 0.6 }} />
                    <div className="pl-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] text-[var(--text-secondary)]">{item.label}</span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">{pct}%</span>
                      </div>
                      <div className="text-lg font-semibold font-mono text-[var(--text-primary)] mt-0.5">
                        {count}
                      </div>
                      <div className="w-full h-1 bg-[var(--bg)] rounded-full mt-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.max(pct, 4)}%`,
                            backgroundColor: group.color,
                            opacity: 0.5,
                          }}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
