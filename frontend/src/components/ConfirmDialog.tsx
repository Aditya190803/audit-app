import React, { useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, isOpen, onCancel)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 animate-fade-in">
      <div
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] w-full max-w-sm mx-4 animate-scale-in"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[var(--border)]">
          <div className={`shrink-0 p-1.5 rounded-lg ${danger ? 'bg-[var(--danger-bg)]' : 'bg-[var(--surface-inset)]'}`}>
            <AlertTriangle
              className={`h-4 w-4 ${danger ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}
              strokeWidth={1.5}
            />
          </div>
          <h2 id="confirm-title" className="text-sm font-semibold text-[var(--text-primary)] flex-1">
            {title}
          </h2>
          <button
            onClick={onCancel}
            className="btn-icon p-1 shrink-0"
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p id="confirm-message" className="text-sm text-[var(--text-secondary)] leading-relaxed">
            {message}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[var(--border)]">
          <button onClick={onCancel} className="btn-secondary text-xs">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`text-xs px-4 py-1.5 rounded-[var(--radius-md)] font-medium transition-colors duration-150 ${
              danger
                ? 'bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90'
                : 'btn-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
