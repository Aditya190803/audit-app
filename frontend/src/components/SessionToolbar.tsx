import React from 'react'
import {
  Search, Download, X, Table2, BarChart3,
  AlertTriangle, Activity, Loader2, RotateCcw,
} from 'lucide-react'
import type { AuditSession } from '../types/api'

function ViewTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-md)]
        transition-all duration-150
        ${active
          ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-xs)] ring-1 ring-[var(--border)]'
          : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
        }
      `}
    >
      {icon}
      {label}
    </button>
  )
}

export function SessionToolbar({
  session,
  activeView,
  onViewChange,
  onExport,
  onRetag,
  isRetagging,
  searchQuery,
  onSearchChange,
  filterCount,
  onToggleFilters,
  isComputing,
}: {
  session: AuditSession
  activeView: 'data' | 'review' | 'activity'
  onViewChange: (v: 'data' | 'review' | 'activity') => void
  onExport: () => void
  onRetag: () => void
  isRetagging: boolean
  searchQuery: string
  onSearchChange: (q: string) => void
  filterCount: number
  onToggleFilters: () => void
  isComputing: boolean
}) {
  return (
    <div className="h-[var(--header-height)] bg-[var(--surface)] border-b border-[var(--border)] px-4 flex items-center gap-3 shrink-0">
      {/* View switcher */}
      <div className="flex items-center bg-[var(--bg-raised)] rounded-[var(--radius-lg)] p-0.5 border border-[var(--border-subtle)]">
        <ViewTab
          active={activeView === 'data'}
          onClick={() => onViewChange('data')}
          icon={<Table2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Transactions"
        />
        <ViewTab
          active={activeView === 'review'}
          onClick={() => onViewChange('review')}
          icon={<BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Review"
        />
        <ViewTab
          active={activeView === 'activity'}
          onClick={() => onViewChange('activity')}
          icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.5} />}
          label="Activity"
        />
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Search */}
      {activeView === 'data' && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={2} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transactions..."
            className="input-field pl-9 py-1.5 text-[13px] bg-[var(--bg)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn-icon p-0.5"
            >
              <X className="h-3 w-3" strokeWidth={2} />
            </button>
          )}
        </div>
      )}

      {activeView === 'data' && (
        <button
          onClick={onToggleFilters}
          className={`btn-secondary text-xs py-1.5 ${filterCount > 0 ? 'border-[var(--primary)]/30 text-[var(--primary)]' : ''}`}
        >
          <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
          Filters
          {filterCount > 0 && (
            <span className="badge badge-primary text-[10px] ml-1 py-0 px-1.5">{filterCount}</span>
          )}
        </button>
      )}

      <div className="flex-1" />

      {/* Session info */}
      <div className="hidden lg:flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
        {isComputing && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" strokeWidth={2} />}
        <span className="font-medium text-[var(--text-secondary)] truncate max-w-[200px]">
          {session.name || `Audit #${session.id}`}
        </span>
      </div>

      <div className="h-5 w-px bg-[var(--border)]" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          onClick={onRetag}
          disabled={isRetagging}
          className={`btn-icon p-2 ${isRetagging ? 'opacity-60 cursor-not-allowed' : ''}`}
          title="Re-tag session"
        >
          {isRetagging
            ? <Loader2 className="h-4 w-4 animate-spin text-[var(--primary)]" strokeWidth={1.5} />
            : <RotateCcw className="h-4 w-4" strokeWidth={1.5} />
          }
        </button>
        <button onClick={onExport} className="btn-icon p-2" title="Export">
          <Download className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
