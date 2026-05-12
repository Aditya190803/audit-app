import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import { Calendar, CreditCard, Users, PieChart as PieIcon, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react'
import type { AuditAnalytics } from '../utils/auditAnalytics'

function money(value: number): string {
  return `₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

function moneyShort(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 10000000) return `₹${(abs / 10000000).toFixed(1)}Cr`
  if (abs >= 100000) return `₹${(abs / 100000).toFixed(1)}L`
  if (abs >= 1000) return `₹${(abs / 1000).toFixed(1)}K`
  return `₹${abs.toLocaleString('en-IN')}`
}

const COLORS = {
  debit: '#dc2626',
  credit: '#059669',
  client: '#059669',
  broker: '#d97706',
  suspicious: '#dc2626',
  untagged: '#9ca3af',
}

interface SummaryViewProps {
  analytics: AuditAnalytics
}

export const SummaryView: React.FC<SummaryViewProps> = ({ analytics }) => {
  const total = analytics.totals.count || 1
  const tagData = [
    { name: 'Client', value: analytics.tagDistribution.client, color: COLORS.client },
    { name: 'Broker', value: analytics.tagDistribution.broker, color: COLORS.broker },
    { name: 'Suspicious', value: analytics.tagDistribution.suspicious, color: COLORS.suspicious },
    { name: 'Untagged', value: analytics.tagDistribution.untagged, color: COLORS.untagged },
  ].filter((d) => d.value > 0)

  const monthData = analytics.monthlyBreakdown.map((m) => ({
    month: m.month.slice(-2),
    label: m.month,
    debit: Math.round(m.debit),
    credit: Math.round(m.credit),
  }))

  return (
    <div className="px-3 pb-3 space-y-3 overflow-y-auto">
      {/* Hero KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <KpiCard
          label="Transactions"
          value={String(analytics.totals.count)}
          icon={<TrendingUp className="h-4 w-4 text-[var(--primary)]" strokeWidth={1.5} />}
          accent="var(--primary)"
        />
        <KpiCard
          label="Total Debit"
          value={money(analytics.totals.debit)}
          icon={<TrendingDown className="h-4 w-4 text-[var(--danger)]" strokeWidth={1.5} />}
          accent="var(--danger)"
          valueColor="text-[var(--danger)]"
        />
        <KpiCard
          label="Total Credit"
          value={money(analytics.totals.credit)}
          icon={<TrendingUp className="h-4 w-4 text-[var(--success)]" strokeWidth={1.5} />}
          accent="var(--success)"
          valueColor="text-[var(--success)]"
        />
        <KpiCard
          label="Net Flow"
          value={money(analytics.totals.net)}
          icon={<AlertTriangle className="h-4 w-4" style={{ color: analytics.totals.net < 0 ? 'var(--danger)' : 'var(--success)' }} strokeWidth={1.5} />}
          accent={analytics.totals.net < 0 ? 'var(--danger)' : 'var(--success)'}
          valueColor={analytics.totals.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success)]'}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MiniKpi label="Clients" value={String(analytics.clientGroups.length)} />
        <MiniKpi label="Parties" value={String(analytics.partyGroups.length)} />
        <MiniKpi label="Tagged" value={`${Math.round((analytics.totals.tagged / total) * 100)}%`} />
        <MiniKpi label="Suspicious" value={String(analytics.tagDistribution.suspicious)} highlight />
      </div>

      {/* Monthly Chart */}
      {monthData.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-primary)]">Monthly Trends</span>
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  axisLine={{ stroke: 'var(--border)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => moneyShort(v)}
                />
                <Tooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, name: any) => [
                    typeof value === 'number' ? money(value) : String(value),
                    name,
                  ]}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-md)',
                  }}
                />
                <Bar dataKey="debit" fill={COLORS.debit} radius={[2, 2, 0, 0]} />
                <Bar dataKey="credit" fill={COLORS.credit} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Tag Distribution + Payment Methods */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Donut chart */}
        <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <PieIcon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-primary)]">Tag Distribution</span>
          </div>
          {tagData.length > 0 ? (
            <div className="flex items-center gap-4">
              <div style={{ width: 140, height: 140 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={tagData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {tagData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any, name: any) => [
                        typeof value === 'number' ? `${value} (${Math.round((value / total) * 100)}%)` : String(value),
                        name,
                      ]}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-2">
                {tagData.map((item) => (
                  <div key={item.name} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-secondary)]">{item.name}</span>
                        <span className="text-xs font-mono font-semibold text-[var(--text-primary)]">{item.value}</span>
                      </div>
                      <div className="w-full h-1 bg-[var(--bg)] rounded-full mt-0.5 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.round((item.value / total) * 100)}%`,
                            backgroundColor: item.color,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">No data</p>
          )}
        </div>

        {/* Top Clients */}
        <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-primary)]">Top Clients</span>
          </div>
          <div className="space-y-1.5">
            {analytics.topClients.map((c) => (
              <div key={c.name} className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-secondary)] truncate flex-1 min-w-0">{c.name}</span>
                <span className="text-[10px] text-[var(--text-tertiary)] font-mono">{c.count}</span>
                <span className="text-[10px] text-[var(--danger)] font-mono w-16 text-right">{moneyShort(c.debit)}</span>
                <span className="text-[10px] text-[var(--success)] font-mono w-16 text-right">{moneyShort(c.credit)}</span>
              </div>
            ))}
            {analytics.topClients.length === 0 && (
              <p className="text-xs text-[var(--text-tertiary)] py-2 text-center">No data</p>
            )}
          </div>
        </div>
      </div>

      {/* Payment Methods */}
      {analytics.paymentMethods.length > 0 && (
        <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] p-3">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
            <span className="text-xs font-medium text-[var(--text-primary)]">Payment Methods</span>
          </div>
          <div className="space-y-1.5">
            {analytics.paymentMethods.map((pm) => {
              const maxCount = Math.max(...analytics.paymentMethods.map((p) => p.count), 1)
              return (
                <div key={pm.method} className="flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-secondary)] w-16 shrink-0">{pm.method}</span>
                  <div className="flex-1 h-2 bg-[var(--bg)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--primary)]/60 rounded-full"
                      style={{ width: `${(pm.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-tertiary)] font-mono w-8 text-right">{pm.count}</span>
                  <span className="text-[10px] text-[var(--danger)] font-mono w-14 text-right">{moneyShort(pm.debit)}</span>
                  <span className="text-[10px] text-[var(--success)] font-mono w-14 text-right">{moneyShort(pm.credit)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  valueColor = 'text-[var(--text-primary)]',
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent: string
  valueColor?: string
}) {
  return (
    <div className="bg-white border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-2.5 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full" style={{ backgroundColor: accent }} />
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{label}</span>
        {icon}
      </div>
      <div className={`text-lg font-semibold font-mono ${valueColor}`}>{value}</div>
    </div>
  )
}

function MiniKpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`px-3 py-2 rounded-[var(--radius-md)] border text-center ${highlight ? 'bg-[var(--danger-subtle)] border-[var(--danger)]/20' : 'bg-white border-[var(--border)]'}`}>
      <div className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{label}</div>
      <div className={`text-sm font-semibold font-mono mt-0.5 ${highlight ? 'text-[var(--danger)]' : 'text-[var(--text-primary)]'}`}>{value}</div>
    </div>
  )
}
