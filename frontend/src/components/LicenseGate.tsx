import React from 'react'
import { AlertTriangle, Mail } from 'lucide-react'

const DEVELOPER_EMAIL = 'adityamer.work@gmail.com'
const DEVELOPER_PHONE = '+91 8422039965'

export function LicenseGate(): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="relative mx-4 w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center shadow-2xl"
        style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.25, 0.1, 0.25, 1) both' }}
      >
        {/* Warning icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--danger-bg)]">
          <AlertTriangle className="h-7 w-7 text-[var(--danger)]" strokeWidth={1.5} />
        </div>

        {/* Title */}
        <h2 className="mt-5 text-lg font-semibold text-[var(--text-primary)]">
          Application Error
        </h2>

        {/* Message */}
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">
          There was an issue verifying your application.
          <br />
          Please contact the developer to resolve this.
        </p>

        {/* Contact details */}
        <div className="mt-6 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-left">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
            <Mail className="h-3.5 w-3.5" strokeWidth={2} />
            Developer contact
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Email</dt>
              <dd className="select-all break-all font-mono text-[var(--text-primary)]">{DEVELOPER_EMAIL}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--text-secondary)]">Phone</dt>
              <dd className="select-all font-mono text-[var(--text-primary)]">{DEVELOPER_PHONE}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
            Send these details with the error code below.
          </p>
        </div>

        {/* Subtle error code for you to identify the cause */}
        <p className="mt-4 text-[10px] font-mono text-[var(--text-tertiary)]">
          Error code: E_VERIFY_FAILED
        </p>
      </div>
    </div>
  )
}
