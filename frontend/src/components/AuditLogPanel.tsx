import React, { useEffect, useState } from 'react'
import { Activity, Tag, FileText, Settings, RefreshCw, ChevronDown } from 'lucide-react'
import type { AuditLog } from '../types/api'
import { getAuditLogs } from '../lib/api'

interface AuditLogPanelProps {
  sessionId: number | null
}

const ACTION_META: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  tag_added:             { icon: <Tag className="h-3 w-3" />,        color: 'text-[var(--primary)]',  label: 'Tag Added' },
  tag_removed:           { icon: <Tag className="h-3 w-3" />,        color: 'text-[var(--danger)]',   label: 'Tag Removed' },
  tag_changed:           { icon: <Tag className="h-3 w-3" />,        color: 'text-[var(--warning)]',  label: 'Tag Changed' },
  transaction_updated:   { icon: <FileText className="h-3 w-3" />,   color: 'text-[var(--text-secondary)]', label: 'Transaction Updated' },
  notes_updated:         { icon: <FileText className="h-3 w-3" />,   color: 'text-[var(--text-secondary)]', label: 'Notes Updated' },
  session_created:       { icon: <Activity className="h-3 w-3" />,   color: 'text-[var(--primary)]',  label: 'Session Created' },
  settings_changed:      { icon: <Settings className="h-3 w-3" />,   color: 'text-[var(--text-tertiary)]', label: 'Settings Changed' },
  retag_triggered:       { icon: <RefreshCw className="h-3 w-3" />,  color: 'text-[var(--warning)]',  label: 'Re-tagged' },
}

function getActionMeta(action: string) {
  return ACTION_META[action] ?? {
    icon: <Activity className="h-3 w-3" />,
    color: 'text-[var(--text-tertiary)]',
    label: action.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function diffSummary(log: AuditLog): string | null {
  if (!log.new_value) return null
  const parts: string[] = []
  if (log.action === 'tag_added' || log.action === 'tag_changed') {
    const tag = log.new_value
    if (tag.category) parts.push(`category: ${tag.category}`)
    if (tag.confidence != null) parts.push(`conf: ${(Number(tag.confidence) * 100).toFixed(0)}%`)
  } else if (log.action === 'notes_updated') {
    const text = (log.new_value as any)?.notes || ''
    return text.length > 40 ? text.slice(0, 40) + '…' : text
  }
  return parts.length ? parts.join(', ') : null
}

export const AuditLogPanel: React.FC<AuditLogPanelProps> = ({ sessionId }) => {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(false)
  const [limit, setLimit] = useState(100)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    getAuditLogs(sessionId, limit)
      .then((res) => setLogs(res.data.filter((log) => log.action !== 'review_status_changed')))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [sessionId, limit])

  if (!sessionId) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-tertiary)] text-sm">
        No session selected
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <span className="text-sm font-medium text-[var(--text-primary)]">Activity Log</span>
          {logs.length > 0 && (
            <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{logs.length} entries</span>
          )}
        </div>
        <button
          onClick={() => {
            setLoading(true)
            getAuditLogs(sessionId, limit)
              .then((res) => setLogs(res.data.filter((log) => log.action !== 'review_status_changed')))
              .catch(() => {})
              .finally(() => setLoading(false))
          }}
          className="btn-icon p-1.5"
          title="Refresh"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
        </button>
      </div>

      {/* Log entries */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-[var(--text-tertiary)] text-xs">
            Loading activity…
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--text-tertiary)]">
            <Activity className="h-8 w-8 opacity-30" strokeWidth={1} />
            <span className="text-xs">No activity recorded yet</span>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {logs.map((log) => {
              const meta = getActionMeta(log.action)
              const diff = diffSummary(log)
              const isExpanded = expanded === log.id
              const hasDetails = log.old_value || log.new_value
              return (
                <div
                  key={log.id}
                  className="group px-5 py-2.5 hover:bg-[var(--surface-hover)] transition-colors duration-100"
                >
                  <div className="flex items-start gap-2.5">
                    {/* Icon */}
                    <div className={`mt-0.5 shrink-0 ${meta.color}`}>
                      {meta.icon}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
                        {log.is_auto && (
                          <span className="text-[10px] px-1.5 py-0 rounded-full bg-[var(--surface-hover)] text-[var(--text-tertiary)] font-medium">
                            auto
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--text-tertiary)] ml-auto shrink-0">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      {diff && (
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 font-mono truncate">
                          {diff}
                        </div>
                      )}
                      {log.entity_type && log.entity_id != null && (
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
                          {log.entity_type} #{log.entity_id}
                        </div>
                      )}
                    </div>
                    {/* Expand button */}
                    {hasDetails && (
                      <button
                        onClick={() => setExpanded(isExpanded ? null : log.id)}
                        className="opacity-0 group-hover:opacity-100 btn-icon p-0.5 shrink-0 mt-0.5 transition-opacity"
                        title="Show details"
                      >
                        <ChevronDown
                          className={`h-3 w-3 text-[var(--text-tertiary)] transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                          strokeWidth={2}
                        />
                      </button>
                    )}
                  </div>
                  {/* Expanded details */}
                  {isExpanded && hasDetails && (
                    <div className="mt-2 ml-5 p-2 rounded-[var(--radius-sm)] bg-[var(--bg)] border border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap break-all">
                      {log.old_value && (
                        <div className="mb-1 text-[var(--danger)]">- {JSON.stringify(log.old_value, null, 2)}</div>
                      )}
                      {log.new_value && (
                        <div className="text-[var(--success)]">+ {JSON.stringify(log.new_value, null, 2)}</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Load more footer */}
      {logs.length >= limit && (
        <div className="shrink-0 px-5 py-2 border-t border-[var(--border-subtle)]">
          <button
            onClick={() => setLimit((l) => l + 100)}
            className="w-full text-xs text-[var(--text-tertiary)] hover:text-[var(--primary)] transition-colors py-1"
          >
            Load more entries
          </button>
        </div>
      )}
    </div>
  )
}
