import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Building2, Tag, Users, X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useUIStore, type ManualTagType } from '../stores/uiStore'

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
    placeholder: 'Enter client name',
    icon: <Users className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />,
  },
  broker: {
    title: 'Broker tag detail',
    label: 'Broker name',
    placeholder: 'Enter broker name',
    icon: <Building2 className="h-4 w-4 text-[var(--warning)]" strokeWidth={1.5} />,
  },
  suspicious: {
    title: 'Suspicious tag detail',
    label: 'Suspicious reason',
    placeholder: 'Enter suspicious reason',
    icon: <AlertTriangle className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />,
  },
}

export function buildManualTagReason(tagType: ManualTagType, detail: string): string {
  if (tagType === 'broker') return `Manually tagged as broker: ${detail}`
  if (tagType === 'client') return `Manually tagged as client: ${detail}`
  return `Suspicious: ${detail}`
}

export const TagDetailDialog: React.FC = () => {
  const request = useUIStore((s) => s.tagDetailRequest)
  const resolveTagDetail = useUIStore((s) => s.resolveTagDetail)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedType, setSelectedType] = useState<ManualTagType>('client')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    if (!request) return
    setSelectedType(request.tagType ?? 'client')
    setDetail('')
  }, [request])

  useEffect(() => {
    if (request) window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [request, selectedType])

  const close = useMemo(() => () => resolveTagDetail(null), [resolveTagDetail])
  useFocusTrap(panelRef, Boolean(request), close)

  if (!request) return null

  const meta = TAG_META[selectedType]
  const scopeText = request.scope === 'bulk' ? 'these transactions' : 'this transaction'
  const canChooseType = request.tagType == null

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
            <label htmlFor="manual-tag-detail" className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1.5">
              {meta.label}
            </label>
            <input
              ref={inputRef}
              id="manual-tag-detail"
              type="text"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              className="input-field"
              placeholder={meta.placeholder}
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
