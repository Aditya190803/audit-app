import React, { useMemo } from 'react'
import {
  AlertTriangle, Layers, Calendar,
  ArrowDownRight, ArrowUpRight,
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
    <div className="max-w-6xl mx-auto space-y-4 px-1 animate-fade-in-up">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={<Layers className="h-4 w-4" strokeWidth={1.5} />}
          label="Transactions"
          value={String(total)}
          accent="var(--primary)"
        />
        <KpiCard
          icon={<ArrowDownRight className="h-4 w-4" strokeWidth={2} />}
          label="Total Debit"
          value={money(analytics.totals.debit)}
          accent="var(--danger)"
          valueColor="text-[var(--danger)]"
        />
        <KpiCard
          icon={<ArrowUpRight className="h-4 w-4" strokeWidth={2} />}
          label="Total Credit"
          value={money(analytics.totals.credit)}
          accent="var(--success)"
          valueColor="text-[var(--success)]"
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
          label="Net Flow"
          value={money(analytics.totals.net)}
          accent={analytics.totals.net < 0 ? 'var(--danger)' : 'var(--success)'}
          valueColor={analytics.totals.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
        />
        <KpiCard
          icon={<Layers className="h-4 w-4" strokeWidth={1.5} />}
          label="Tagged"
          value={`${taggedPct}%`}
          accent="var(--primary)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Monthly chart */}
        {monthData.length > 0 && (
          <div className="lg:col-span-2 card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
              <span className="stat-label">Monthly Cash Flow</span>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthData} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                    axisLine={{ stroke: 'var(--border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => moneyShort(v)}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [typeof value === 'number' ? money(value) : String(value)]}
                    contentStyle={{
                      fontSize: 12,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      boxShadow: 'var(--shadow-lg)',
                      background: 'var(--surface)',
                    }}
                  />
                  <Bar dataKey="debit" fill="var(--danger)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="credit" fill="var(--success)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs">
              <LegendDot color="var(--danger)" label="Debit" />
              <LegendDot color="var(--success)" label="Credit" />
            </div>
          </div>
        )}

        {/* Right column */}
        <div className="space-y-4">
          {/* Tag distribution */}
          <div className="card p-5">
            <div className="stat-label mb-3">Tag Distribution</div>
            <TagBar
              client={analytics.tagDistribution.client}
              broker={analytics.tagDistribution.broker}
              suspicious={analytics.tagDistribution.suspicious}
              untagged={analytics.tagDistribution.untagged}
              total={total}
            />
            <div className="flex flex-col gap-2 mt-3">
              <LegendRow color="var(--success)" label="Client" value={analytics.tagDistribution.client} />
              <LegendRow color="var(--warning)" label="Broker" value={analytics.tagDistribution.broker} />
              <LegendRow color="var(--danger)" label="Suspicious" value={analytics.tagDistribution.suspicious} />
              <LegendRow color="var(--border-strong)" label="Untagged" value={analytics.tagDistribution.untagged} />
            </div>
          </div>

          {/* Top parties */}
          {topParties.length > 0 && (
            <div className="card p-5">
              <div className="stat-label mb-3">Top Parties</div>
              <div className="space-y-2">
                {topParties.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-2 text-xs">
                    <span className="w-4 text-[10px] font-mono text-[var(--text-tertiary)] text-right">{i + 1}</span>
                    <span className="text-[var(--text-primary)] truncate flex-1 min-w-0 font-medium">{p.name}</span>
                    <span className="text-[var(--text-tertiary)] font-mono shrink-0">{p.count}</span>
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


/* ── Sub-components ──────────────────────────────────────────── */

function KpiCard({ icon, label, value, accent, valueColor = 'text-[var(--text-primary)]' }: {
  icon: React.ReactNode; label: string; value: string; accent: string; valueColor?: string
}) {
  return (
    <div className="card p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-r" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between mb-1.5 ml-1">
        <span className="stat-label">{label}</span>
        <span style={{ color: accent }}>{icon}</span>
      </div>
      <div className={`stat-value ml-1 ${valueColor}`}>{value}</div>
    </div>
  )
}

function TagBar({ client, broker, suspicious, untagged, total }: {
  client: number; broker: number; suspicious: number; untagged: number; total: number
}) {
  const pct = (v: number) => Math.max(0, (v / total) * 100)
  return (
    <div className="flex h-3 rounded-full overflow-hidden bg-[var(--bg-raised)] w-full">
      {client > 0 && <div className="h-full transition-all duration-500" style={{ width: `${pct(client)}%`, backgroundColor: 'var(--success)' }} />}
      {broker > 0 && <div className="h-full transition-all duration-500" style={{ width: `${pct(broker)}%`, backgroundColor: 'var(--warning)' }} />}
      {suspicious > 0 && <div className="h-full transition-all duration-500" style={{ width: `${pct(suspicious)}%`, backgroundColor: 'var(--danger)' }} />}
      {untagged > 0 && <div className="h-full transition-all duration-500" style={{ width: `${pct(untagged)}%`, backgroundColor: 'var(--border-strong)' }} />}
    </div>
  )
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
      <span className="font-mono font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-[var(--text-secondary)]">{label}</span>
    </div>
  )
}
