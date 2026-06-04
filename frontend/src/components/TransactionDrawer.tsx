import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Calendar, IndianRupee, FileText, Hash, Tag,
  MessageSquare, CreditCard, CheckCircle2, AlertCircle,
  Circle, Flag, ChevronRight, Edit3, Save, RotateCcw,
  Layers,
} from 'lucide-react'
import type { Transaction } from '../types/api'
import { updateTransactionNotes, updateReviewStatus, patchTransaction } from '../lib/api'
import { useSessionStore } from '../stores/sessionStore'
import { useUIStore } from '../stores/uiStore'

type ReviewStatus = 'unreviewed' | 'reviewed' | 'needs_review' | 'flagged'

const REVIEW_CYCLE: ReviewStatus[] = ['unreviewed', 'needs_review', 'reviewed', 'flagged']

const STATUS_CFG: Record<ReviewStatus, { label: string; icon: React.ReactNode; cls: string; bg: string }> = {
  unreviewed: {
    label: 'Unreviewed',
    icon: <Circle className="h-3.5 w-3.5" strokeWidth={2} />,
    cls: 'text-[var(--text-tertiary)]',
    bg: 'bg-[var(--surface-inset)]',
  },
  needs_review: {
    label: 'Needs Review',
    icon: <AlertCircle className="h-3.5 w-3.5" strokeWidth={2} />,
    cls: 'text-[var(--warning)]',
    bg: 'bg-[var(--warning-bg,#fef3c7)]',
  },
  reviewed: {
    label: 'Reviewed',
    icon: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />,
    cls: 'text-[var(--success)]',
    bg: 'bg-[var(--success-bg)]',
  },
  flagged: {
    label: 'Flagged',
    icon: <Flag className="h-3.5 w-3.5" strokeWidth={2} />,
    cls: 'text-[var(--danger)]',
    bg: 'bg-[var(--danger-bg)]',
  },
}

const TAG_COLORS: Record<string, string> = {
  client: 'bg-[var(--success-bg)] text-[var(--success)] border-[var(--success)]/20',
  broker: 'bg-[var(--warning-bg,#fef3c7)] text-[var(--warning)] border-[var(--warning)]/20',
  suspicious: 'bg-[var(--danger-bg)] text-[var(--danger)] border-[var(--danger)]/20',
}

function money(v: number | null): string {
  if (v == null) return '–'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : '+'
  return `${sign}₹${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface TransactionDrawerProps {
  transaction: Transaction | null
  onClose: () => void
}

interface FieldRowProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}

function FieldRow({ icon, label, value }: FieldRowProps) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0">
      <span className="shrink-0 mt-0.5 text-[var(--text-tertiary)]">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-0.5">{label}</div>
        <div className="text-[13px] text-[var(--text-primary)] break-words">{value}</div>
      </div>
    </div>
  )
}

export const TransactionDrawer: React.FC<TransactionDrawerProps> = ({ transaction, onClose }) => {
  const { refreshCurrentSession } = useSessionStore()
  const { pushToast } = useUIStore()

  const [notes, setNotes] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [localStatus, setLocalStatus] = useState<ReviewStatus>('unreviewed')
  const [editingPartyName, setEditingPartyName] = useState(false)
  const [partyNameValue, setPartyNameValue] = useState('')
  const [savingPartyName, setSavingPartyName] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const partyNameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (transaction) {
      setNotes(transaction.user_notes || '')
      setPartyNameValue(transaction.party_name || '')
      setLocalStatus((transaction.review_status || 'unreviewed') as ReviewStatus)
      setEditingNotes(false)
      setEditingPartyName(false)
    }
  }, [transaction])

  useEffect(() => {
    if (editingNotes && notesRef.current) notesRef.current.focus()
  }, [editingNotes])

  useEffect(() => {
    if (editingPartyName && partyNameRef.current) partyNameRef.current.focus()
  }, [editingPartyName])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingNotes) onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, editingNotes])

  const handleSaveNotes = useCallback(async () => {
    if (!transaction) return
    setSavingNotes(true)
    try {
      await updateTransactionNotes(transaction.id, notes)
      await refreshCurrentSession()
      setEditingNotes(false)
      pushToast({ message: 'Notes saved' })
    } catch {
      pushToast({ message: 'Failed to save notes', type: 'error' })
    } finally {
      setSavingNotes(false)
    }
  }, [transaction, notes, refreshCurrentSession, pushToast])

  const handleSavePartyName = useCallback(async () => {
    if (!transaction) return
    setSavingPartyName(true)
    try {
      await patchTransaction(transaction.id, { party_name: partyNameValue.trim() || null })
      await refreshCurrentSession()
      setEditingPartyName(false)
      pushToast({ message: 'Party name updated' })
    } catch {
      pushToast({ message: 'Failed to update party name', type: 'error' })
    } finally {
      setSavingPartyName(false)
    }
  }, [transaction, partyNameValue, refreshCurrentSession, pushToast])

  const handleCycleStatus = useCallback(async () => {
    if (!transaction) return
    const idx = REVIEW_CYCLE.indexOf(localStatus)
    const next = REVIEW_CYCLE[(idx + 1) % REVIEW_CYCLE.length]
    setLocalStatus(next)
    try {
      await updateReviewStatus(transaction.id, next)
      await refreshCurrentSession()
    } catch {
      setLocalStatus(localStatus)
      pushToast({ message: 'Failed to update status', type: 'error' })
    }
  }, [transaction, localStatus, refreshCurrentSession, pushToast])

  if (!transaction) return null

  const statusCfg = STATUS_CFG[localStatus]
  const amountColor = (transaction.amount ?? 0) < 0
    ? 'text-[var(--danger)]'
    : (transaction.amount ?? 0) > 0
      ? 'text-[var(--success)]'
      : 'text-[var(--text-primary)]'

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="complementary"
        aria-label="Transaction details"
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[420px] bg-[var(--surface)] border-l border-[var(--border)] shadow-[var(--shadow-xl)] flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[var(--surface-inset)]">
              <FileText className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Transaction Details</h2>
              <p className="text-[11px] text-[var(--text-tertiary)]">ID #{transaction.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        {/* Amount hero */}
        <div className="px-5 py-4 bg-[var(--bg-raised)] border-b border-[var(--border)] shrink-0">
          <div className={`text-2xl font-bold font-mono ${amountColor}`}>
            {money(transaction.amount)}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-1 flex items-center gap-2">
            <span>{transaction.date || 'No date'}</span>
            {transaction.payment_method && (
              <>
                <span>·</span>
                <span className="capitalize">{transaction.payment_method}</span>
              </>
            )}
          </div>
        </div>

        {/* Status badge + cycle button */}
        <div className="px-5 py-3 border-b border-[var(--border)] shrink-0">
          <button
            onClick={handleCycleStatus}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 hover:opacity-80 ${statusCfg.cls} ${statusCfg.bg} border-current/20`}
            title="Click to cycle review status"
          >
            {statusCfg.icon}
            {statusCfg.label}
            <ChevronRight className="h-3 w-3 opacity-60" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-0">
          {/* Core fields */}
          <div className="space-y-0 mb-4">
            {transaction.description && (
              <FieldRow
                icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />}
                label="Description"
                value={transaction.description}
              />
            )}
            {/* Party name - editable */}
            <div className="flex items-start gap-3 py-2.5 border-b border-[var(--border-subtle)]">
              <span className="shrink-0 mt-0.5 text-[var(--text-tertiary)]">
                <Hash className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Party Name</div>
                  {!editingPartyName ? (
                    <button
                      onClick={() => setEditingPartyName(true)}
                      className="btn-icon p-0.5 text-[var(--text-tertiary)]"
                      title="Override party name"
                    >
                      <Edit3 className="h-2.5 w-2.5" strokeWidth={2} />
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setPartyNameValue(transaction.party_name || ''); setEditingPartyName(false) }}
                        className="btn-icon p-0.5 text-[var(--text-tertiary)]"
                        title="Discard"
                      >
                        <RotateCcw className="h-2.5 w-2.5" strokeWidth={2} />
                      </button>
                      <button
                        onClick={handleSavePartyName}
                        disabled={savingPartyName}
                        className="btn-icon p-0.5 text-[var(--primary)]"
                        title="Save"
                      >
                        <Save className="h-2.5 w-2.5" strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
                {editingPartyName ? (
                  <input
                    ref={partyNameRef}
                    type="text"
                    value={partyNameValue}
                    onChange={(e) => setPartyNameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSavePartyName()
                      if (e.key === 'Escape') { setPartyNameValue(transaction.party_name || ''); setEditingPartyName(false) }
                    }}
                    className="w-full input-field text-[13px] py-1 px-2"
                    placeholder="Enter party name…"
                  />
                ) : (
                  <div className="text-[13px] text-[var(--text-primary)] break-words">
                    {transaction.party_name || <span className="text-[var(--text-tertiary)] italic">–</span>}
                  </div>
                )}
              </div>
            </div>
            {transaction.raw_text && transaction.raw_text !== transaction.description && (
              <FieldRow
                icon={<Layers className="h-3.5 w-3.5" strokeWidth={1.5} />}
                label="Raw Text"
                value={
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] break-all">
                    {transaction.raw_text}
                  </span>
                }
              />
            )}
            <FieldRow
              icon={<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />}
              label="Date"
              value={transaction.date || '–'}
            />
            {transaction.payment_method && (
              <FieldRow
                icon={<CreditCard className="h-3.5 w-3.5" strokeWidth={1.5} />}
                label="Payment Method"
                value={<span className="capitalize">{transaction.payment_method}</span>}
              />
            )}
            {transaction.pdf_filename && (
              <FieldRow
                icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />}
                label="Source File"
                value={
                  <span className="truncate block" title={transaction.pdf_filename}>
                    {transaction.pdf_filename.split(/[\\/]/).pop()}
                  </span>
                }
              />
            )}
            {transaction.page_number != null && (
              <FieldRow
                icon={<Hash className="h-3.5 w-3.5" strokeWidth={1.5} />}
                label="Page"
                value={`Page ${transaction.page_number}`}
              />
            )}
            <FieldRow
              icon={<IndianRupee className="h-3.5 w-3.5" strokeWidth={1.5} />}
              label="Amount"
              value={<span className={`font-mono font-semibold ${amountColor}`}>{money(transaction.amount)}</span>}
            />
          </div>

          {/* Tags section */}
          {transaction.tags.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center gap-1.5 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <Tag className="h-3 w-3" strokeWidth={2} />
                Tags
              </div>
              <div className="space-y-1.5">
                {transaction.tags.map((tag) => (
                  <div
                    key={tag.id}
                    className={`flex items-start gap-2 px-3 py-2 rounded-[var(--radius-md)] border text-xs ${TAG_COLORS[tag.tag_type] || 'bg-[var(--surface-inset)] text-[var(--text-secondary)] border-[var(--border)]'}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold capitalize">{tag.tag_type}</div>
                      {tag.reason && (
                        <div className="opacity-80 mt-0.5 text-[11px]">{tag.reason}</div>
                      )}
                    </div>
                    <div className="shrink-0 font-mono text-[10px] opacity-60 mt-0.5">
                      {Math.round(tag.confidence * 100)}%
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                <MessageSquare className="h-3 w-3" strokeWidth={2} />
                Notes
              </div>
              {!editingNotes ? (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="btn-icon p-1 text-[var(--text-tertiary)]"
                  title="Edit notes"
                >
                  <Edit3 className="h-3 w-3" strokeWidth={2} />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setNotes(transaction.user_notes || ''); setEditingNotes(false) }}
                    className="btn-icon p-1 text-[var(--text-tertiary)]"
                    title="Discard"
                  >
                    <RotateCcw className="h-3 w-3" strokeWidth={2} />
                  </button>
                  <button
                    onClick={handleSaveNotes}
                    disabled={savingNotes}
                    className="btn-icon p-1 text-[var(--primary)]"
                    title="Save notes"
                  >
                    <Save className="h-3 w-3" strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            {editingNotes ? (
              <textarea
                ref={notesRef}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this transaction..."
                rows={4}
                maxLength={2000}
                className="w-full input-field text-[13px] resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSaveNotes()
                  if (e.key === 'Escape') { setNotes(transaction.user_notes || ''); setEditingNotes(false) }
                }}
              />
            ) : (
              <div
                onClick={() => setEditingNotes(true)}
                className="min-h-[60px] px-3 py-2.5 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-[13px] text-[var(--text-primary)] cursor-text hover:border-[var(--border-strong)] transition-colors"
              >
                {notes
                  ? <span className="whitespace-pre-wrap">{notes}</span>
                  : <span className="text-[var(--text-tertiary)]">Click to add notes…</span>
                }
              </div>
            )}
            {editingNotes && (
              <div className="text-[10px] text-[var(--text-tertiary)] mt-1 text-right">
                {notes.length}/2000 · ⌘Enter to save
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
