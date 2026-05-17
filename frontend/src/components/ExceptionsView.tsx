import React from 'react'
import { AlertTriangle, ShieldAlert, Info, Calendar, DollarSign, Repeat, Users, CreditCard, HelpCircle, FileQuestion } from 'lucide-react'
import type { AuditAnalytics, ExceptionFilter } from '../utils/auditAnalytics'

interface ExceptionsViewProps {
  analytics: AuditAnalytics
  onFilterChange: (key: string, value: string) => void
}

interface ExceptionItem {
  key: ExceptionFilter
  label: string
  desc: string
  icon: React.ReactNode
  getCount: (a: AuditAnalytics) => number
}

const SEVERITY_GROUPS: {
  key: string
  label: string
  icon: React.ReactNode
  color: string
  bg: string
  items: ExceptionItem[]
}[] = [
  {
    key: 'high',
    label: 'High Risk',
    icon: <ShieldAlert className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--danger)',
    bg: 'var(--danger-subtle)',
    items: [
      { key: 'high_value', label: 'High Value', desc: 'Exceeds suspicious threshold', icon: <DollarSign className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.highValue },
      { key: 'missing_party', label: 'Missing Party', desc: 'No party name extracted', icon: <FileQuestion className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.missingParty },
    ],
  },
  {
    key: 'medium',
    label: 'Medium Risk',
    icon: <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--warning)',
    bg: 'var(--warning-subtle)',
    items: [
      { key: 'repeat', label: 'Repeat Parties', desc: 'Multiple same-party transactions', icon: <Repeat className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.repeat },
      { key: 'same_day', label: 'Same-Day Duplicates', desc: 'Same party, same date', icon: <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.sameDay },
      { key: 'cash', label: 'Cash Transactions', desc: 'Cash mentions in description', icon: <CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.cash },
      { key: 'weekend', label: 'Weekend Activity', desc: 'Transactions on Sat/Sun', icon: <Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.weekend },
      { key: 'round_amount', label: 'Round Amounts', desc: 'Amounts in round thousands', icon: <DollarSign className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.roundAmount },
    ],
  },
  {
    key: 'low',
    label: 'Review Needed',
    icon: <Info className="h-4 w-4" strokeWidth={1.5} />,
    color: 'var(--text-secondary)',
    bg: 'var(--surface-hover)',
    items: [
      { key: 'untagged', label: 'Untagged', desc: 'No tag assigned yet', icon: <HelpCircle className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.untagged },
      { key: 'low_confidence', label: 'Low Confidence', desc: 'Tag confidence < 85%', icon: <Users className="h-3.5 w-3.5" strokeWidth={1.5} />, getCount: (a) => a.exceptions.lowConfidence },
    ],
  },
]

export const ExceptionsView: React.FC<ExceptionsViewProps> = ({
  analytics,
  onFilterChange,
}) => {
  const totalExceptions = Object.values(analytics.exceptions).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
        <span className="font-semibold">{totalExceptions} exceptions found</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span>Select a category to filter matching transactions</span>
      </div>

      {SEVERITY_GROUPS.map((group) => {
        const groupTotal = group.items.reduce((sum, item) => sum + item.getCount(analytics), 0)
        return (
          <div key={group.key} className="space-y-2">
            <div className="flex items-center gap-2">
              <div
                className="badge text-xs"
                style={{ color: group.color, backgroundColor: group.bg }}
              >
                {group.icon}
                {group.label}
              </div>
              <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{groupTotal} items</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {group.items.map((item) => {
                const count = item.getCount(analytics)
                const pct = totalExceptions > 0 ? Math.round((count / totalExceptions) * 100) : 0
                return (
                  <button
                    key={item.key}
                    onClick={() => onFilterChange('exception', item.key)}
                    className="card card-hover text-left p-3.5 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full rounded-r" style={{ backgroundColor: group.color, opacity: 0.6 }} />
                    <div className="pl-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: group.color }}>{item.icon}</span>
                          <span className="text-[11px] font-medium text-[var(--text-secondary)]">{item.label}</span>
                        </div>
                        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{pct}%</span>
                      </div>
                      <div className="stat-value mt-1 text-lg">{count}</div>
                      <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{item.desc}</div>
                      <div className="w-full h-1 bg-[var(--bg-raised)] rounded-full mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
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
