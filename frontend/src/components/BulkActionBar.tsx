import React, { useState, useMemo } from 'react'
import { Tag, Trash2, X } from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { useSessionStore } from '../stores/sessionStore'
import { bulkAddTags, bulkRemoveTags } from '../lib/api'
import { buildManualTagReason } from './TagDetailDialog'

const TAG_OPTIONS: { value: 'client' | 'broker' | 'suspicious'; label: string; cls: string }[] = [
  { value: 'client', label: 'Client', cls: 'text-[var(--success)]' },
  { value: 'broker', label: 'Broker', cls: 'text-[var(--warning)]' },
  { value: 'suspicious', label: 'Suspicious', cls: 'text-[var(--danger)]' },
]

export const BulkActionBar: React.FC = () => {
  const { selectedTransactionIds, clearSelection, pushToast, requestTagDetail } = useUIStore()
  const { transactions, refreshCurrentSession } = useSessionStore()
  const [loading, setLoading] = useState(false)
  const [tagMenuOpen, setTagMenuOpen] = useState(false)

  const selectedTags = useMemo(() => {
    const selected = new Set(selectedTransactionIds)
    return transactions
      .filter((tx) => selected.has(tx.id))
      .flatMap((tx) => tx.tags)
  }, [selectedTransactionIds, transactions])

  if (selectedTransactionIds.length === 0) return null

  const count = selectedTransactionIds.length

  const handleBulkTag = async (tagType: 'client' | 'broker' | 'suspicious') => {
    const result = await requestTagDetail({ tagType, scope: 'bulk' })
    if (!result) return

    setLoading(true)
    setTagMenuOpen(false)
    try {
      await bulkAddTags(selectedTransactionIds, result.tagType, buildManualTagReason(result.tagType, result.detail), 1.0)
      await refreshCurrentSession()
      pushToast({ message: `Tagged ${count} transactions as ${result.tagType}` })
      clearSelection()
    } catch {
      pushToast({ message: 'Bulk tag failed', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveTags = async () => {
    if (selectedTags.length === 0) {
      pushToast({ message: 'Selected transactions have no tags to remove' })
      return
    }
    setLoading(true)
    setTagMenuOpen(false)
    try {
      await bulkRemoveTags(selectedTags.map((tag) => tag.id))
      await refreshCurrentSession()
      pushToast({ message: `Removed ${selectedTags.length} tags` })
      clearSelection()
    } catch {
      pushToast({ message: 'Remove tags failed', type: 'error' })
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
              <div className="my-1 h-px bg-[var(--border)]" />
              <button
                onClick={handleRemoveTags}
                disabled={loading || selectedTags.length === 0}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                Remove tags
              </button>
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
