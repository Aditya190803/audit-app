import React from 'react'
import { AlertTriangle, Mail } from 'lucide-react'

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

        {/* Contact button */}
        <a
          href="mailto:adityamer.work@gmail.com"
          className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors duration-150 hover:bg-[var(--primary-hover)]"
        >
          <Mail className="h-4 w-4" strokeWidth={2} />
          Contact Developer
        </a>

        {/* Subtle error code for you to identify the cause */}
        <p className="mt-4 text-[10px] font-mono text-[var(--text-tertiary)]">
          Error code: E_VERIFY_FAILED
        </p>
      </div>
    </div>
  )
}
