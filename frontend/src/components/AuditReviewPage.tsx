import React, { useMemo } from 'react'
import {
  AlertTriangle, CheckCircle2, FileCheck2,
  Search, Tag, ArrowUpRight, ArrowDownRight,
  Users, Building2, TrendingUp, Calendar, Repeat,
  IndianRupee, HelpCircle,
} from 'lucide-react'
import type { AuditAnalytics } from '../utils/auditAnalytics'

interface AuditReviewPageProps {
  analytics: AuditAnalytics
  activeTab: string
  suspiciousThreshold: number
  onTabChange: (tab: any) => void
  onExceptionFilter: (key: string, value: string) => void
}

function moneyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`
  return `₹${abs.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function moneyFull(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function parseDateValue(value: string | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1])).getTime()
  }
  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? null : parsed
}

function formatDate(value: number | null): string {
  if (value == null) return 'N/A'
  return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const AuditReviewPage: React.FC<AuditReviewPageProps> = ({
  analytics,
  suspiciousThreshold,
  onExceptionFilter,
}) => {
  const transactions = analytics.filteredTransactions
  const total = Math.max(analytics.totals.count, 1)

  // ── Computed metrics ──
  const sourceFiles = new Set(transactions.map((tx) => tx.pdf_filename).filter(Boolean)).size
  const dateValues = transactions.map((tx) => parseDateValue(tx.date)).filter((v): v is number => v !== null)
  const firstDate = dateValues.length ? Math.min(...dateValues) : null
  const lastDate = dateValues.length ? Math.max(...dateValues) : null
  const daySpan = firstDate && lastDate ? Math.round((lastDate - firstDate) / 86400000) + 1 : 0

  // Tag distribution
  const tagDist = analytics.tagDistribution
  const taggedPct = Math.round((analytics.totals.tagged / total) * 100)

  // Top parties by transaction count
  const topParties = useMemo(() => {
    const partyMap = new Map<string, { count: number; debit: number; credit: number }>()
    for (const tx of transactions) {
      const name = tx.description || tx.party_name || 'Unknown'
      const entry = partyMap.get(name) ?? { count: 0, debit: 0, credit: 0 }
      entry.count += 1
      if ((tx.amount ?? 0) < 0) entry.debit += Math.abs(tx.amount ?? 0)
      else entry.credit += tx.amount ?? 0
      partyMap.set(name, entry)
    }
    return Array.from(partyMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
  }, [transactions])

  // Suspicious breakdown
  const suspiciousCount = tagDist.suspicious
  const recurringCount = analytics.suspiciousSubcategories.recurring.length
  const highValueCount = transactions.filter(tx => Math.abs(tx.amount ?? 0) >= suspiciousThreshold).length

  // Priority items — only show things that need action
  const priorities = [
    {
      label: 'High-value transactions',
      detail: `Over ₹${suspiciousThreshold.toLocaleString('en-IN')}`,
      count: analytics.exceptions.highValue,
      icon: <IndianRupee className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'danger' as const,
      action: () => onExceptionFilter('exception', 'high_value'),
    },
    {
      label: 'Repeat parties',
      detail: 'Same party multiple transactions',
      count: analytics.exceptions.repeat,
      icon: <Repeat className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'warn' as const,
      action: () => onExceptionFilter('exception', 'repeat'),
    },
    {
      label: 'Low-confidence matches',
      detail: 'Auto matches needing verification',
      count: analytics.exceptions.lowConfidence,
      icon: <Search className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'warn' as const,
      action: () => onExceptionFilter('exception', 'low_confidence'),
    },
    {
      label: 'Missing party name',
      detail: 'Extraction cleanup needed',
      count: analytics.exceptions.missingParty,
      icon: <HelpCircle className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'warn' as const,
      action: () => onExceptionFilter('exception', 'missing_party'),
    },
    {
      label: 'Cash transactions',
      detail: 'Physical cash movements',
      count: analytics.exceptions.cash,
      icon: <IndianRupee className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'neutral' as const,
      action: () => onExceptionFilter('exception', 'cash'),
    },
    {
      label: 'Same-day duplicates',
      detail: 'Multiple entries on same date',
      count: analytics.exceptions.sameDay,
      icon: <Calendar className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'neutral' as const,
      action: () => onExceptionFilter('exception', 'same_day'),
    },
    {
      label: 'Round amounts',
      detail: 'Potentially structured',
      count: analytics.exceptions.roundAmount,
      icon: <TrendingUp className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'neutral' as const,
      action: () => onExceptionFilter('exception', 'round_amount'),
    },
    {
      label: 'Untagged',
      detail: 'Not yet classified',
      count: analytics.totals.untagged,
      icon: <Tag className="h-4 w-4" strokeWidth={1.5} />,
      tone: 'neutral' as const,
      action: () => onExceptionFilter('exception', 'untagged'),
    },
  ].filter((item) => item.count > 0)

  // Readiness checklist
  const readiness = [
    { label: 'Suspicious scan complete', done: true },
    { label: 'No untagged transactions', done: analytics.totals.untagged === 0 },
    { label: 'Low-confidence tags resolved', done: analytics.exceptions.lowConfidence === 0 },
    { label: 'No missing parties', done: analytics.exceptions.missingParty === 0 },
  ]
  const readinessDone = readiness.filter((r) => r.done).length

  return (
    <div className="flex-1 flex flex-col h-full bg-[var(--bg)] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
        <h1 className="text-lg font-bold text-[var(--text-primary)]">Audit Review</h1>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">
          {analytics.filteredTransactions.length} transactions · {sourceFiles > 0 ? `${sourceFiles} source file${sourceFiles > 1 ? 's' : ''}` : '1 source file'}
          {firstDate && lastDate && ` · ${formatDate(firstDate)} — ${formatDate(lastDate)} (${daySpan} days)`}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-5">
        <div className="max-w-6xl mx-auto space-y-4 mb-5">

          {/* ── Row 1: KPI strip ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
            <KPI label="Total" value={String(analytics.totals.count)} />
            <KPI label="Debit" value={moneyShort(analytics.totals.debit)} tone="danger" icon={<ArrowDownRight className="h-3.5 w-3.5" />} />
            <KPI label="Credit" value={moneyShort(analytics.totals.credit)} tone="good" icon={<ArrowUpRight className="h-3.5 w-3.5" />} />
            <KPI label="Net Flow" value={moneyShort(analytics.totals.net)} tone={analytics.totals.net < 0 ? 'danger' : 'good'} />
            <KPI label="Clients" value={String(tagDist.client)} icon={<Users className="h-3.5 w-3.5" />} />
            <KPI label="Brokers" value={String(tagDist.broker)} icon={<Building2 className="h-3.5 w-3.5" />} />
            <KPI label="Suspicious" value={String(tagDist.suspicious)} tone={tagDist.suspicious > 0 ? 'danger' : 'good'} icon={<AlertTriangle className="h-3.5 w-3.5" />} />
          </div>

          {/* ── Row 2: Tag coverage bar ── */}
          <section className="card px-5 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">Tag Coverage</span>
              <span className="text-xs font-mono text-[var(--text-secondary)]">{taggedPct}% tagged · {analytics.totals.untagged} remaining</span>
            </div>
            <div className="h-3 bg-[var(--bg-raised)] rounded-full overflow-hidden flex">
              {tagDist.client > 0 && (
                <div
                  className="h-full bg-[var(--success)] transition-all duration-500"
                  style={{ width: `${(tagDist.client / total) * 100}%` }}
                  title={`Client: ${tagDist.client}`}
                />
              )}
              {tagDist.broker > 0 && (
                <div
                  className="h-full bg-[var(--warning)] transition-all duration-500"
                  style={{ width: `${(tagDist.broker / total) * 100}%` }}
                  title={`Broker: ${tagDist.broker}`}
                />
              )}
              {tagDist.suspicious > 0 && (
                <div
                  className="h-full bg-[var(--danger)] transition-all duration-500"
                  style={{ width: `${(tagDist.suspicious / total) * 100}%` }}
                  title={`Suspicious: ${tagDist.suspicious}`}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-2">
              {[
                { label: 'Client', color: 'var(--success)', count: tagDist.client },
                { label: 'Broker', color: 'var(--warning)', count: tagDist.broker },
                { label: 'Suspicious', color: 'var(--danger)', count: tagDist.suspicious },
                { label: 'Untagged', color: 'var(--text-tertiary)', count: tagDist.untagged },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                  {item.label} ({item.count})
                </div>
              ))}
            </div>
          </section>

          {/* ── Row 3: Priority Queue + Export Readiness ── */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-4">
            {/* Priority Queue */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Exceptions</h2>
                {priorities.length > 0 ? (
                  <span className="badge badge-neutral">{priorities.length} types found</span>
                ) : (
                  <span className="badge badge-primary">All clear</span>
                )}
              </div>
              {priorities.length > 0 ? (
                <div className="space-y-1.5">
                  {priorities.map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] transition-colors duration-100 group"
                    >
                      <span className={`shrink-0 ${
                        item.tone === 'danger' ? 'text-[var(--danger)]'
                          : item.tone === 'warn' ? 'text-[var(--warning)]'
                            : 'text-[var(--text-tertiary)]'
                      }`}>
                        {item.icon}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-medium text-[var(--text-primary)]">{item.label}</span>
                        <span className="block text-[11px] text-[var(--text-tertiary)]">{item.detail}</span>
                      </span>
                      <span className={`text-sm font-bold font-mono shrink-0 ${
                        item.tone === 'danger' ? 'text-[var(--danger)]'
                          : item.tone === 'warn' ? 'text-[var(--warning)]'
                            : 'text-[var(--text-secondary)]'
                      }`}>
                        {item.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--success)] bg-[var(--success-bg)] border border-[var(--success-subtle)] rounded-[var(--radius-md)] px-3.5 py-3">
                  <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                  No exceptions in the current view
                </div>
              )}
            </section>

            {/* Export Readiness */}
            <section className="card p-5">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">Export Readiness</h2>
                <span className={`badge ${readinessDone === readiness.length ? 'badge-primary' : 'badge-neutral'}`}>
                  {readinessDone}/{readiness.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {readiness.map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 text-xs">
                    {item.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-[var(--success)] shrink-0" strokeWidth={1.5} />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)] shrink-0" strokeWidth={1.5} />
                    )}
                    <span className={item.done ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)] font-medium'}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
              {/* Quick summary numbers */}
              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
                <div className="min-w-0">
                  <div className="text-sm font-bold font-mono text-[var(--text-primary)]">{suspiciousCount}</div>
                  <div className="stat-label mt-0.5 truncate">Suspicious</div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold font-mono text-[var(--text-primary)]">{recurringCount}</div>
                  <div className="stat-label mt-0.5 truncate">Recurring groups</div>
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold font-mono text-[var(--text-primary)]">{highValueCount}</div>
                  <div className="stat-label mt-0.5 truncate">High value</div>
                </div>
              </div>
            </section>
          </div>

          {/* ── Row 4: Top parties table ── */}
          <section className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Top Parties by Volume</h2>
              <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">Most frequently transacting counterparties</p>
            </div>
            {topParties.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg)]">
                      <th className="px-4 py-2.5 text-left font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Party</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Count</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Debit</th>
                      <th className="px-4 py-2.5 text-right font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[10px]">Credit</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-[var(--text-tertiary)] uppercase tracking-wider text-[10px] w-[200px]">Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topParties.map(([name, data], i) => {
                      const maxVol = topParties[0][1].count
                      return (
                        <tr
                          key={`${name}-${i}`}
                          className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-hover)] transition-colors"
                        >
                          <td className="px-4 py-2.5 text-[var(--text-primary)] font-medium max-w-[260px] truncate" title={name}>
                            {name}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--text-secondary)]">
                            {data.count}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--danger)]">
                            {data.debit > 0 ? moneyShort(data.debit) : '–'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-[var(--success)]">
                            {data.credit > 0 ? moneyShort(data.credit) : '–'}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[var(--bg-raised)] rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[var(--primary)] rounded-full"
                                  style={{ width: `${(data.count / maxVol) * 100}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-xs text-[var(--text-tertiary)]">
                No transactions to analyze
              </div>
            )}
          </section>

          {/* ── Row 5: Money flow summary ── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <section className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownRight className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-[var(--text-primary)]">Total Debits</span>
              </div>
              <div className="text-xl font-bold font-mono text-[var(--danger)]">{moneyFull(analytics.totals.debit)}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                {transactions.filter(tx => (tx.amount ?? 0) < 0).length} debit transactions
              </div>
            </section>
            <section className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-[var(--text-primary)]">Total Credits</span>
              </div>
              <div className="text-xl font-bold font-mono text-[var(--success)]">{moneyFull(analytics.totals.credit)}</div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                {transactions.filter(tx => (tx.amount ?? 0) >= 0).length} credit transactions
              </div>
            </section>
            <section className="card p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileCheck2 className="h-4 w-4 text-[var(--primary)]" strokeWidth={1.5} />
                <span className="text-xs font-semibold text-[var(--text-primary)]">Net Position</span>
              </div>
              <div className={`text-xl font-bold font-mono ${analytics.totals.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}`}>
                {analytics.totals.net < 0 ? '-' : '+'}{moneyFull(Math.abs(analytics.totals.net))}
              </div>
              <div className="text-[11px] text-[var(--text-tertiary)] mt-1">
                Across {daySpan > 0 ? `${daySpan} days` : 'all transactions'}
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  )
}


/* ── Sub-components ──────────────────────────────────────────── */

function KPI({
  label,
  value,
  tone = 'neutral',
  icon,
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'warn' | 'danger'
  icon?: React.ReactNode
}) {
  const toneClass = {
    neutral: 'text-[var(--text-primary)]',
    good: 'text-[var(--success)]',
    warn: 'text-[var(--warning)]',
    danger: 'text-[var(--danger)]',
  }[tone]

  return (
    <div className="card px-3 py-3 min-w-0">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className={toneClass}>{icon}</span>}
        <span className="stat-label truncate">{label}</span>
      </div>
      <div className={`text-base font-bold font-mono ${toneClass} truncate`}>{value}</div>
    </div>
  )
}
