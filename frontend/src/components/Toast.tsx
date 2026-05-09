import React from 'react'
import { useUIStore } from '../stores/uiStore'

export const ToastContainer: React.FC = () => {
  const { toasts, popToast } = useUIStore()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-3 px-4 py-2.5 bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] text-sm animate-in slide-in-from-right"
        >
          <span className="text-[var(--text-primary)]">{t.message}</span>
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
            className="p-0.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <svg className="h-3 w-3" strokeWidth={2} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
