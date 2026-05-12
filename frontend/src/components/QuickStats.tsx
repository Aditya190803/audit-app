import React from 'react'
import {
  Activity,
  Tag,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  CreditCard,
} from 'lucide-react'
import type { AuditAnalytics } from '../utils/auditAnalytics'
import { extractTagMatchedName } from '../utils/auditAnalytics'

function txDisplayName(tx: { party_name?: string | null; tags?: { tag_type: string; reason: string | null }[] }): string {
  const clientTag = tx.tags?.find((t) => t.tag_type === 'client')
  if (clientTag) {
    const matched = extractTagMatchedName(clientTag.reason)
    if (matched) return matched
  }
  return tx.party_name || 'Unknown'
}

function moneyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`
  return `₹${abs.toLocaleString('en-IN')}`
}

interface QuickStatsProps {
  analytics: AuditAnalytics
}

export const QuickStats: React.FC<QuickStatsProps> = ({ analytics }) => {
  const txns = analytics.filteredTransactions
  const total = analytics.totals.count || 1

  // Find most recent suspicious transaction
  const recentSuspicious = txns
    .filter((t) => t.tags.some((tag) => tag.tag_type === 'suspicious'))
    .slice(-1)[0]

  // Find largest debit
  const largestDebit = txns
    .filter((t) => (t.amount ?? 0) < 0)
    .sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))[0]

  // Find top client by count
  const topClient = analytics.clientGroups[0]

  // Avg transaction amount
  const avgAmount = txns.length > 0
    ? txns.reduce((sum, t) => sum + Math.abs(t.amount ?? 0), 0) / txns.length
    : 0

  // Top payment method
  const topMethod = analytics.paymentMethods[0]

  return (
    <div className="px-3 pb-2 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
      <StatTile
        icon={<Activity className="h-3.5 w-3.5" strokeWidth={1.5} />}
        label="Avg amount"
        value={moneyShort(avgAmount)}
      />
      <StatTile
        icon={<Tag className="h-3.5 w-3.5 text-[var(--success)]" strokeWidth={1.5} />}
        label="Tagged"
        value={`${Math.round((analytics.totals.tagged / total) * 100)}%`}
      />
      <StatTile
        icon={<TrendingDown className="h-3.5 w-3.5 text-[var(--danger)]" strokeWidth={1.5} />}
        label="Largest debit"
        value={largestDebit ? moneyShort(largestDebit.amount ?? 0) : '-'}
        detail={largestDebit ? txDisplayName(largestDebit) : undefined}
      />
      <StatTile
        icon={<TrendingUp className="h-3.5 w-3.5 text-[var(--success)]" strokeWidth={1.5} />}
        label="Top client"
        value={topClient ? String(topClient.count) : '-'}
        detail={topClient?.name || undefined}
      />
      <StatTile
        icon={<AlertTriangle className="h-3.5 w-3.5 text-[var(--warning)]" strokeWidth={1.5} />}
        label="Recent suspicious"
        value={recentSuspicious ? moneyShort(recentSuspicious.amount ?? 0) : '-'}
        detail={recentSuspicious?.party_name || undefined}
      />
      <StatTile
        icon={<CreditCard className="h-3.5 w-3.5 text-[var(--primary)]" strokeWidth={1.5} />}
        label="Top method"
        value={topMethod ? topMethod.method : '-'}
        detail={topMethod ? `${topMethod.count} txns` : undefined}
      />
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] px-2.5 py-2 hover:border-[var(--border-strong)] transition-colors">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[var(--text-tertiary)]">{icon}</span>
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wide font-medium">{label}</span>
      </div>
      <div className="text-sm font-semibold font-mono text-[var(--text-primary)] truncate">{value}</div>
      {detail && (
        <div className="text-[10px] text-[var(--text-tertiary)] truncate mt-0.5" title={detail}>{detail}</div>
      )}
    </div>
  )
}
