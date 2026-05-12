import React, { useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  LayoutList,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import type { AdvancedFilters, AuditAnalytics, ReviewView } from '../utils/auditAnalytics'
import { SummaryView } from './SummaryView'
import { ExceptionsView } from './ExceptionsView'
import { QuickStats } from './QuickStats'

interface AuditReviewPanelProps {
  analytics: AuditAnalytics
  reviewView: ReviewView
  onReviewViewChange: (view: ReviewView) => void
  onFilterChange: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
}

function money(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

const VIEW_META: { key: ReviewView; label: string; icon: React.ReactNode }[] = [
  { key: 'dashboard', label: 'Transactions', icon: <LayoutList className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  { key: 'exceptions', label: 'Exceptions', icon: <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} /> },
  { key: 'summary', label: 'Summary', icon: <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} /> },
]

export const AuditReviewPanel: React.FC<AuditReviewPanelProps> = ({
  analytics,
  reviewView,
  onReviewViewChange,
  onFilterChange,
}) => {
  const [compact, setCompact] = useState(false)

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border)] flex flex-col">
      {/* Header bar */}
      <div className="px-3 py-2 flex items-center gap-2 shrink-0">
        {VIEW_META.map((view) => (
          <button
            key={view.key}
            onClick={() => onReviewViewChange(view.key)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-[var(--radius-md)] border transition-colors duration-150 ${
              reviewView === view.key
                ? 'bg-[var(--primary-subtle)] text-[var(--primary)] border-[var(--primary)]/30'
                : 'bg-white text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-strong)]'
            }`}
          >
            {view.icon}
            {view.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Totals */}
        <div className="hidden lg:flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <span className="font-medium">{analytics.totals.count} shown</span>
          <span className="opacity-20">|</span>
          <TrendingDown className="h-3 w-3 text-[var(--danger)]" strokeWidth={2} />
          <span className="text-[var(--danger)] font-medium">{money(analytics.totals.debit)}</span>
          <TrendingUp className="h-3 w-3 text-[var(--success)]" strokeWidth={2} />
          <span className="text-[var(--success)] font-medium">{money(analytics.totals.credit)}</span>
          <span className="opacity-20">|</span>
          <span className="text-[var(--text-tertiary)]">{analytics.totals.untagged} untagged</span>
        </div>

        {/* Compact toggle */}
        <button
          onClick={() => setCompact((c) => !c)}
          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-[var(--radius-sm)] transition-colors"
          title={compact ? 'Expand panel' : 'Collapse panel'}
        >
          {compact ? <ChevronDown className="h-4 w-4" strokeWidth={2} /> : <ChevronUp className="h-4 w-4" strokeWidth={2} />}
        </button>
      </div>

      {/* Content */}
      {!compact && (
        <div className="flex-1 min-h-0 animate-fade-in-down">
          {reviewView === 'dashboard' && (
            <QuickStats analytics={analytics} />
          )}

          {reviewView === 'exceptions' && (
            <ExceptionsView
              analytics={analytics}
              onFilterChange={onFilterChange}
            />
          )}

          {reviewView === 'summary' && (
            <SummaryView analytics={analytics} />
          )}
        </div>
      )}
    </div>
  )
}
