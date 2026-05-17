import React from 'react'
import { useUIStore } from '../stores/uiStore'
import { X, CheckCircle } from 'lucide-react'

export const ToastContainer: React.FC = () => {
  const { toasts, popToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] animate-slide-in-right"
        >
          <CheckCircle className="h-4 w-4 text-[var(--success)] shrink-0" strokeWidth={1.5} />
          <span className="text-sm text-[var(--text-primary)] flex-1">{t.message}</span>
          {t.action && (
            <button
              onClick={() => { t.action!.onClick(); popToast(t.id) }}
              className="text-xs font-semibold text-[var(--primary)] hover:underline whitespace-nowrap"
            >
              {t.action.label}
            </button>
          )}
          <button
            onClick={() => popToast(t.id)}
            className="btn-icon p-0.5 shrink-0"
          >
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        </div>
      ))}
    </div>
  )
}
