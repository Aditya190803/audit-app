import React from 'react'
import { useUIStore } from '../stores/uiStore'
import { X, CheckCircle, Info, ArrowDownCircle, AlertCircle } from 'lucide-react'

function ToastIcon({ type }: { type?: 'success' | 'info' | 'update' | 'error' }) {
  switch (type) {
    case 'update':
      return <ArrowDownCircle className="h-4 w-4 text-[var(--primary)] shrink-0" strokeWidth={1.5} />
    case 'info':
      return <Info className="h-4 w-4 text-[var(--primary)] shrink-0" strokeWidth={1.5} />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-[var(--danger)] shrink-0" strokeWidth={1.5} />
    case 'success':
    default:
      return <CheckCircle className="h-4 w-4 text-[var(--success)] shrink-0" strokeWidth={1.5} />
  }
}

export const ToastContainer: React.FC = () => {
  const { toasts, popToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 bg-[var(--surface)] border rounded-[var(--radius-lg)] shadow-[var(--shadow-xl)] animate-slide-in-right ${
            t.type === 'error'
              ? 'border-[var(--danger)]/40 bg-[var(--danger-bg)]'
              : 'border-[var(--border)]'
          }`}
        >
          <ToastIcon type={t.type} />
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

