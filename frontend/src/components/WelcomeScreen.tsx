import { Plus, FileText, ArrowRight } from 'lucide-react'
import type { AuditSession } from '../types/api'

export function WelcomeScreen({
  sessions,
  onSessionSelect,
  onNewAudit,
}: {
  sessions: AuditSession[]
  onSessionSelect: (s: AuditSession) => void
  onNewAudit: () => void
}) {
  const recent = [...sessions]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)

  return (
    <div className="flex-1 flex items-center justify-center p-8 animate-fade-in">
      <div className="text-center max-w-lg">
        {/* Hero */}
        <p className="text-sm text-[var(--text-secondary)] mb-8 max-w-sm mx-auto leading-relaxed">
          Upload bank statements and client lists to begin. The system will automatically parse, match, and flag transactions for review.
        </p>

        <button onClick={onNewAudit} className="btn-primary text-sm px-6 py-2.5 mb-8">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Start New Audit
        </button>

        {/* Recent sessions */}
        {recent.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
              Recent sessions
            </p>
            <div className="space-y-1.5 max-w-sm mx-auto">
              {recent.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSessionSelect(s)}
                  className="w-full flex items-center gap-3 px-4 py-3 card card-hover text-left group"
                >
                  <div className="p-1.5 rounded-md bg-[var(--surface-inset)]">
                    <FileText className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {s.name || `Audit #${s.id}`}
                    </div>
                    <div className="text-[11px] text-[var(--text-tertiary)]">
                      {new Date(s.updated_at).toLocaleDateString('en-IN', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      })}
                      {s.transaction_count != null && ` · ${s.transaction_count} transactions`}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
