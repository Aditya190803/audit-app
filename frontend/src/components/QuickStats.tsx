import React, { useMemo } from 'react'
import {
  TrendingDown, TrendingUp, AlertTriangle, Layers, Calendar,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { AuditAnalytics } from '../utils/auditAnalytics'

function money(v: number): string {
  return `₹${Math.abs(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}
function moneyShort(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`
  return `₹${abs.toLocaleString('en-IN')}`
}

interface QuickStatsProps {
  analytics: AuditAnalytics
}

export const QuickStats: React.FC<QuickStatsProps> = ({ analytics }) => {
  const total = analytics.totals.count || 1
  const taggedPct = Math.round((analytics.totals.tagged / total) * 100)

  const monthData = useMemo(() => analytics.monthlyBreakdown.map((m) => ({
    month: m.month.slice(-2),
    label: m.month,
    debit: Math.round(m.debit),
    credit: Math.round(m.credit),
  })), [analytics.monthlyBreakdown])

  const topParties = analytics.topParties.slice(0, 5)

  return (
    <div className="max-w-6xl mx-auto space-y-4 px-1">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard icon={<Layers className="h-4 w-4" strokeWidth={1.5} />} label="Transactions" value={String(total)} accent="var(--primary)" />
        <KpiCard icon={<TrendingDown className="h-4 w-4" strokeWidth={1.5} />} label="Total Debit" value={money(analytics.totals.debit)} accent="var(--danger)" valueColor="text-[var(--danger)]" />
        <KpiCard icon={<TrendingUp className="h-4 w-4" strokeWidth={1.5} />} label="Total Credit" value={money(analytics.totals.credit)} accent="var(--success)" valueColor="text-[var(--success)]" />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />} label="Net Flow" value={money(analytics.totals.net)} accent={analytics.totals.net < 0 ? 'var(--danger)' : 'var(--success)'} valueColor={analytics.totals.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'} />
        <KpiCard icon={<Layers className="h-4 w-4" strokeWidth={1.5} />} label="Tagged" value={`${taggedPct}%`} accent="var(--primary)" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly chart */}
        {monthData.length > 0 && (
          <div className="lg:col-span-2 bg-white border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
              <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">Monthly Cash Flow</span>
            </div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => moneyShort(v)} />
                  <Tooltip formatter={(value: unknown) => [typeof value === 'number' ? money(value) : String(value)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }} />
                  <Bar dataKey="debit" fill="var(--danger)" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="credit" fill="var(--success)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Tag distribution + top parties */}
        <div className="space-y-3">
          <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
            <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-3">Tag Distribution</div>
            <TagBar
              client={analytics.tagDistribution.client}
              broker={analytics.tagDistribution.broker}
              suspicious={analytics.tagDistribution.suspicious}
              untagged={analytics.tagDistribution.untagged}
              total={total}
            />
            <div className="flex flex-col gap-1.5 mt-3">
              <LegendRow color="var(--success)" label="Client" value={analytics.tagDistribution.client} />
              <LegendRow color="var(--warning)" label="Broker" value={analytics.tagDistribution.broker} />
              <LegendRow color="var(--danger)" label="Suspicious" value={analytics.tagDistribution.suspicious} />
              <LegendRow color="var(--border)" label="Untagged" value={analytics.tagDistribution.untagged} />
            </div>
          </div>

          {topParties.length > 0 && (
            <div className="bg-white border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <div className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider mb-2">Top Parties</div>
              <div className="space-y-1.5">
                {topParties.map((p) => (
                  <div key={p.name} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--text-secondary)] truncate flex-1 min-w-0">{p.name}</span>
                    <span className="text-[var(--text-tertiary)] font-mono ml-2">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function KpiCard({ icon, label, value, accent, valueColor = 'text-[var(--text-primary)]' }: {
  icon: React.ReactNode; label: string; value: string; accent: string; valueColor?: string
}) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2.5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{label}</span>
        {icon}
      </div>
      <div className={`text-lg font-semibold font-mono ${valueColor}`}>{value}</div>
    </div>
  )
}

function TagBar({ client, broker, suspicious, untagged, total }: {
  client: number; broker: number; suspicious: number; untagged: number; total: number
}) {
  const pct = (v: number) => Math.max(0, (v / total) * 100)
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-[var(--border)] w-full">
      {client > 0 && <div className="h-full transition-all duration-300" style={{ width: `${pct(client)}%`, backgroundColor: 'var(--success)' }} />}
      {broker > 0 && <div className="h-full transition-all duration-300" style={{ width: `${pct(broker)}%`, backgroundColor: 'var(--warning)' }} />}
      {suspicious > 0 && <div className="h-full transition-all duration-300" style={{ width: `${pct(suspicious)}%`, backgroundColor: 'var(--danger)' }} />}
      {untagged > 0 && <div className="h-full transition-all duration-300" style={{ width: `${pct(untagged)}%`, backgroundColor: 'var(--border)' }} />}
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
      <span className="font-mono font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  )
}
