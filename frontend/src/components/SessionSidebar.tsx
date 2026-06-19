import React, { useState, useEffect, useRef } from 'react'
import {
  Plus, FileText, MoreHorizontal, Clock,
  Edit3, Check, X, Trash2, PanelLeft, Settings,
} from 'lucide-react'
import type { AuditSession } from '../types/api'
import { deleteSession, renameSession } from '../lib/api'
import { ConfirmDialog } from './ConfirmDialog'

export function SessionSidebar({
  sessions,
  currentSession,
  isOpen,
  onToggle,
  onSessionSelect,
  onNewAudit,
  onSettings,
  onLoadSessions,
}: {
  sessions: AuditSession[]
  currentSession: AuditSession | null
  isOpen: boolean
  onToggle: () => void
  onSessionSelect: (s: AuditSession) => void
  onNewAudit: () => void
  onSettings: () => void
  onLoadSessions: () => Promise<void>
}) {
  const [renaming, setRenaming] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [contextMenu, setContextMenu] = useState<{ id: number; x: number; y: number } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const contextRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleContextMenu = (e: React.MouseEvent, id: number) => {
    e.preventDefault()
    setContextMenu({ id, x: e.clientX, y: e.clientY })
  }

  const handleRename = async (id: number) => {
    if (renameValue.trim()) {
      await renameSession(id, renameValue.trim())
      await onLoadSessions()
    }
    setRenaming(null)
    setRenameValue('')
  }

  const handleDelete = async (id: number) => {
    await deleteSession(id)
    await onLoadSessions()
    setConfirmDeleteId(null)
    setContextMenu(null)
  }

  const sorted = [...sessions].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  )

  if (!isOpen) {
    return (
      <div className="w-[var(--sidebar-collapsed)] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col items-center py-3 gap-2 shrink-0">
        <button
          onClick={onToggle}
          className="btn-icon"
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
        </button>
        <div className="w-8 h-px bg-[var(--border)] my-1" />
        <button onClick={onNewAudit} className="btn-icon" title="New audit">
          <Plus className="h-4 w-4" strokeWidth={2} />
        </button>
        <div className="flex-1" />
        <button onClick={onSettings} className="btn-icon" title="Settings">
          <Settings className="h-4 w-4" strokeWidth={1.5} />
        </button>
      </div>
    )
  }

  return (
    <div
      className="w-[var(--sidebar-width)] bg-[var(--surface)] border-r border-[var(--border)] flex flex-col shrink-0 animate-slide-in-left"
      style={{ animationDuration: '0.15s' }}
    >
      {/* Sidebar header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--border-subtle)]">
        <span className="text-sm font-semibold text-[var(--text-primary)]">Sessions</span>
        <div className="flex items-center gap-1">
          <button onClick={onNewAudit} className="btn-icon p-1.5" title="New audit">
            <Plus className="h-4 w-4" strokeWidth={2} />
          </button>
          <button onClick={onToggle} className="btn-icon p-1.5" title="Collapse sidebar">
            <PanelLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Session list */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {sorted.length === 0 && (
          <div className="text-center py-8">
            <FileText className="h-8 w-8 mx-auto text-[var(--border-strong)] mb-2" strokeWidth={1} />
            <p className="text-xs text-[var(--text-tertiary)]">No audit sessions yet</p>
            <button onClick={onNewAudit} className="mt-3 btn-primary text-xs py-1.5 px-3">
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Start audit
            </button>
          </div>
        )}

        {sorted.map((session) => {
          const isActive = currentSession?.id === session.id
          const isRenaming = renaming === session.id

          return (
            <div
              key={session.id}
              onContextMenu={(e) => handleContextMenu(e, session.id)}
              className={`
                group relative flex items-center gap-2.5 px-3 py-2.5 rounded-[var(--radius-md)]
                cursor-pointer select-none transition-all duration-150
                ${isActive
                  ? 'bg-[var(--primary-bg)] border border-[var(--primary)]/20 text-[var(--primary)]'
                  : 'hover:bg-[var(--surface-hover)] text-[var(--text-primary)]'
                }
              `}
              onClick={() => !isRenaming && onSessionSelect(session)}
            >
              <div className={`shrink-0 p-1 rounded-md ${isActive ? 'bg-[var(--primary-subtle)]' : 'bg-[var(--surface-inset)]'}`}>
                <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />
              </div>

              <div className="flex-1 min-w-0">
                {isRenaming ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleRename(session.id); if (e.key === 'Escape') setRenaming(null) }}
                      className="input-field text-xs py-0.5 px-1.5"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleRename(session.id) }} className="btn-icon p-0.5">
                      <Check className="h-3 w-3" strokeWidth={2} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setRenaming(null) }} className="btn-icon p-0.5">
                      <X className="h-3 w-3" strokeWidth={2} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-xs font-medium truncate">
                      {session.name || `Audit #${session.id}`}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5" strokeWidth={2} />
                        {new Date(session.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      {session.transaction_count != null && session.transaction_count > 0 && (
                        <span className="text-[10px] text-[var(--text-tertiary)] font-mono">
                          {session.transaction_count.toLocaleString()} rows
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              <button
                onClick={(e) => { e.stopPropagation(); handleContextMenu(e, session.id) }}
                className="opacity-0 group-hover:opacity-100 btn-icon p-1 shrink-0 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Sidebar footer */}
      <div className="px-3 py-2 border-t border-[var(--border-subtle)]">
        <button onClick={onSettings} className="btn-ghost text-xs w-full justify-start py-2">
          <Settings className="h-3.5 w-3.5" strokeWidth={1.5} />
          Settings
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 card shadow-[var(--shadow-lg)] py-1 min-w-[160px] animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => {
              const s = sessions.find((s) => s.id === contextMenu.id)
              setRenameValue(s?.name || '')
              setRenaming(contextMenu.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors"
          >
            <Edit3 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Rename
          </button>
          <button
            onClick={() => {
              setConfirmDeleteId(contextMenu.id)
              setContextMenu(null)
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-[var(--danger)] hover:bg-[var(--danger-bg)] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            Delete
          </button>
        </div>
      )}

      {/* Confirm delete dialog */}
      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Audit Session"
        message="This will permanently delete the session and all its transactions. This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}
