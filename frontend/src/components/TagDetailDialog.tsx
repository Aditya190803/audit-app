import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Building2, ChevronDown, Search, Tag, Users, X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useUIStore, type ManualTagType } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useSessionStore } from '../stores/sessionStore'
import { getClientNames } from '../lib/api'

const TAG_OPTIONS: { value: ManualTagType; label: string }[] = [
  { value: 'client', label: 'Client' },
  { value: 'broker', label: 'Broker' },
  { value: 'suspicious', label: 'Suspicious' },
]

const TAG_META: Record<ManualTagType, {
  title: string
  label: string
  placeholder: string
  icon: React.ReactNode
}> = {
  client: {
    title: 'Client tag detail',
    label: 'Client name',
    placeholder: 'Search client names…',
    icon: <Users className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />,
  },
  broker: {
    title: 'Broker tag detail',
    label: 'Broker name',
    placeholder: 'Search broker names…',
    icon: <Building2 className="h-4 w-4 text-[var(--warning)]" strokeWidth={1.5} />,
  },
  suspicious: {
    title: 'Suspicious tag detail',
    label: 'Suspicious reason',
    placeholder: 'Search reasons…',
    icon: <AlertTriangle className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />,
  },
}

const SUSPICIOUS_REASONS = [
  'Exceeds suspicious threshold',
  'Contains suspicious keyword',
  'Recurring transaction',
  'Unauthorized advance',
  'Third-party transfer',
  'Round tripping',
  'Layering',
  'Structuring',
  'Accommodation entry',
  'Pass through transaction',
  'Proxy / surrogate transaction',
  'Hawala',
  'Pooling of funds',
  'Guaranteed / fixed return',
  'Other – suspicious',
]

export function buildManualTagReason(tagType: ManualTagType, detail: string): string {
  if (tagType === 'broker') return `Manually tagged as broker: ${detail}`
  if (tagType === 'client') return `Manually tagged as client: ${detail}`
  return `Suspicious: ${detail}`
}

/* ── Searchable Dropdown ──────────────────────────────────────────── */

interface SearchableDropdownProps {
  options: string[]
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  placeholder: string
  loading?: boolean
  emptyLabel?: string
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  options,
  value,
  onChange,
  onSubmit,
  placeholder,
  loading,
  emptyLabel = 'No options',
}) => {
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim()
    if (!q) return options
    return options.filter((o) => o.toLowerCase().includes(q))
  }, [options, value])

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return
    const item = listRef.current.children[highlightIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = useCallback(
    (opt: string) => {
      onChange(opt)
      setOpen(false)
      setHighlightIdx(-1)
    },
    [onChange],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlightIdx >= 0 && highlightIdx < filtered.length) {
        select(filtered[highlightIdx])
      } else {
        onSubmit()
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] pointer-events-none" strokeWidth={1.5} />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
            setHighlightIdx(-1)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="input-field pl-8 pr-7"
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          onClick={() => {
            setOpen((o) => !o)
            inputRef.current?.focus()
          }}
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>
      </div>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-lg)] py-1"
        >
          {loading ? (
            <li className="px-3 py-2 text-xs text-[var(--text-tertiary)] text-center">Loading…</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-xs text-[var(--text-tertiary)] text-center">{emptyLabel}</li>
          ) : (
            filtered.map((opt, idx) => (
              <li
                key={opt}
                role="option"
                aria-selected={idx === highlightIdx}
                className={`px-3 py-1.5 text-xs cursor-pointer transition-colors duration-75 ${
                  idx === highlightIdx
                    ? 'bg-[var(--primary)] text-white'
                    : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  select(opt)
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                {opt}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

/* ── Dialog ────────────────────────────────────────────────────────── */

export const TagDetailDialog: React.FC = () => {
  const request = useUIStore((s) => s.tagDetailRequest)
  const resolveTagDetail = useUIStore((s) => s.resolveTagDetail)
  const settings = useSettingsStore((s) => s.settings)
  const currentSession = useSessionStore((s) => s.currentSession)

  const panelRef = useRef<HTMLDivElement>(null)
  const [selectedType, setSelectedType] = useState<ManualTagType>('client')
  const [detail, setDetail] = useState('')
  const [clientNames, setClientNames] = useState<string[]>([])
  const [clientNamesLoading, setClientNamesLoading] = useState(false)

  // Load client names when dialog opens or session changes
  useEffect(() => {
    if (!request || !currentSession) return
    let cancelled = false
    setClientNamesLoading(true)
    getClientNames(currentSession.id)
      .then((res) => {
        if (!cancelled) setClientNames(res.data)
      })
      .catch(() => {
        if (!cancelled) setClientNames([])
      })
      .finally(() => {
        if (!cancelled) setClientNamesLoading(false)
      })
    return () => { cancelled = true }
  }, [request, currentSession])

  useEffect(() => {
    if (!request) return
    setSelectedType(request.tagType ?? 'client')
    setDetail('')
  }, [request])

  const close = useMemo(() => () => resolveTagDetail(null), [resolveTagDetail])
  useFocusTrap(panelRef, Boolean(request), close)

  if (!request) return null

  const meta = TAG_META[selectedType]
  const scopeText = request.scope === 'bulk' ? 'these transactions' : 'this transaction'
  const canChooseType = request.tagType == null

  // Compute options for the current tag type
  const dropdownOptions: string[] = useMemo(() => {
    if (selectedType === 'client') {
      return clientNames
    }
    if (selectedType === 'broker') {
      return (settings.broker_list as string[]) || []
    }
    // suspicious
    return SUSPICIOUS_REASONS
  }, [selectedType, clientNames, settings.broker_list])

  const submit = () => {
    const trimmed = detail.trim()
    if (!trimmed) {
      resolveTagDetail(null)
      return
    }
    resolveTagDetail({ tagType: selectedType, detail: trimmed })
  }

  const dialog = (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--text-primary)]/40 animate-fade-in">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tag-detail-title"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] w-full max-w-sm mx-4 animate-scale-in"
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className="shrink-0 p-1.5 rounded-lg bg-[var(--surface-inset)]">
            {canChooseType ? <Tag className="h-4 w-4 text-[var(--primary)]" strokeWidth={1.5} /> : meta.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="tag-detail-title" className="text-sm font-semibold text-[var(--text-primary)]">
              {canChooseType ? 'Add tag detail' : meta.title}
            </h2>
            <p className="text-[11px] text-[var(--text-tertiary)]">
              Save a manual tag for {scopeText}.
            </p>
          </div>
          <button onClick={close} className="btn-icon p-1 shrink-0" aria-label="Cancel">
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {canChooseType && (
            <div>
              <label htmlFor="manual-tag-type" className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
                Tag type
              </label>
              <select
                id="manual-tag-type"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ManualTagType)}
                className="select-field"
              >
                {TAG_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
              {meta.label}
            </label>
            <SearchableDropdown
              options={dropdownOptions}
              value={detail}
              onChange={setDetail}
              onSubmit={submit}
              placeholder={meta.placeholder}
              loading={selectedType === 'client' && clientNamesLoading}
              emptyLabel={
                selectedType === 'client'
                  ? 'No clients found — type a name'
                  : selectedType === 'broker'
                    ? 'No brokers match'
                    : 'No reasons match'
              }
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={close} className="btn-secondary text-xs">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary text-xs px-4 py-1.5">
            Save tag
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}
