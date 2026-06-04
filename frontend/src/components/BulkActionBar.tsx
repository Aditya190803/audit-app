import React, { useState } from 'react'
import { CheckCircle2, AlertCircle, Flag, Circle, Tag, X, Loader2 } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { bulkUpdateReviewStatus } from '../lib/api'
import { addTag } from '../lib/api'

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_review' | 'flagged'

const STATUS_OPTIONS: { value: ReviewStatus; label: string; icon: React.ReactNode; cls: string }[] = [
  { value: 'reviewed', label: 'Mark Reviewed', icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />, cls: 'text-[var(--success)]' },
  { value: 'needs_review', label: 'Needs Review', icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />, cls: 'text-[var(--warning)]' },
  { value: 'flagged', label: 'Flag', icon: <Flag className="h-3.5 w-3.5" strokeWidth={2} />, cls: 'text-[var(--danger)]' },
  { value: 'unreviewed', label: 'Clear Status', icon: <Circle className="h-3.5 w-3.5" strokeWidth={2} />, cls: 'text-[var(--text-tertiary)]' },
]

const TAG_OPTIONS: { value: 'client' | 'broker' | 'suspicious'; label: string; cls: string }[] = [
  { value: 'client', label: 'Client', cls: 'text-[var(--success)]' },
  { value: 'broker', label: 'Broker', cls: 'text-[var(--warning)]' },
  { value: 'suspicious', label: 'Suspicious', cls: 'text-[var(--danger)]' },
]

export const BulkActionBar: React.FC = () => {
  const { selectedTransactionIds, clearSelection, pushToast } = useUIStore()
  const { refreshCurrentSession } = useSessionStore()
  const [loading, setLoading] = useState(false)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)

  if (selectedTransactionIds.length === 0) return null

  const count = selectedTransactionIds.length

  const handleBulkStatus = async (status: ReviewStatus) => {
    setLoading(true)
    try {
      const res = await bulkUpdateReviewStatus(selectedTransactionIds, status)
      await refreshCurrentSession()
      pushToast({ message: `Updated ${res.data.updated_count} transactions to "${status.replace('_', ' ')}"` })
      clearSelection()
    } catch {
      pushToast({ message: 'Bulk update failed', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleBulkTag = async (tagType: 'client' | 'broker' | 'suspicious') => {
    setLoading(true)
    setTagMenuOpen(false)
    try {
      await Promise.all(
        selectedTransactionIds.map((id) =>
          addTag(id, tagType, `Bulk tagged as ${tagType}`, 1.0, 'manual', true)
        )
      )
      await refreshCurrentSession()
      pushToast({ message: `Tagged ${count} transactions as ${tagType}` })
      clearSelection()
    } catch {
      pushToast({ message: 'Bulk tag failed', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-slide-up">
      <div className="flex items-center gap-1 px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-full shadow-[var(--shadow-xl)] text-xs">
        {/* Selection count */}
        <span className="font-semibold text-[var(--text-secondary)] px-2">
          {count} selected
        </span>
        <div className="w-px h-4 bg-[var(--border)]" />

        {/* Status actions */}
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleBulkStatus(opt.value)}
            disabled={loading}
            title={opt.label}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50 ${opt.cls}`}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : opt.icon}
            <span className="hidden sm:inline">{opt.label}</span>
          </button>
        ))}

        <div className="w-px h-4 bg-[var(--border)]" />

        {/* Bulk tag button */}
        <div className="relative">
          <button
            onClick={() => setTagMenuOpen(!tagMenuOpen)}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full font-medium transition-colors hover:bg-[var(--surface-hover)] text-[var(--text-secondary)] disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" strokeWidth={2} />
            <span className="hidden sm:inline">Tag as…</span>
          </button>
          {tagMenuOpen && (
            <div className="absolute bottom-full mb-2 left-0 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] py-1 min-w-[120px]">
              {TAG_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleBulkTag(opt.value)}
                  className={`flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-[var(--surface-hover)] transition-colors ${opt.cls}`}
                >
                  <span className="capitalize font-semibold">{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-[var(--border)]" />

        {/* Clear selection */}
        <button
          onClick={clearSelection}
          className="p-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          title="Clear selection"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}
