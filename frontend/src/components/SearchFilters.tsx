import React, { useMemo } from 'react'
import {
  X, RotateCcw, Users, Shield,
  Layers, Tag,
} from 'lucide-react'
import { useUIStore } from '../stores/uiStore'
import { getFilterVisibility } from '../utils/filterConfig'
import type { AuditAnalytics, ExceptionFilter, AmountDirection, TagSourceFilter, TagConfidenceFilter } from '../utils/auditAnalytics'

import type { Transaction } from '../types/api'

interface SearchFiltersProps {
  analytics: AuditAnalytics
  transactions: Transaction[]
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({ analytics, transactions }) => {
  const {
    resultFilter, advancedFilters,
    setResultFilter, setAdvancedFilter, resetAdvancedFilters,
    activeFilterCount, toggleFiltersExpanded,
  } = useUIStore()

  const vis = getFilterVisibility(resultFilter)
  const count = activeFilterCount()

  // Derive unique values for selects
  const clientNames = useMemo(() => {
    const set = new Set<string>()
    analytics.clientGroups.forEach((g) => set.add(g.name))
    return Array.from(set).sort()
  }, [analytics.clientGroups])

  const brokerNames = useMemo(() => {
    const set = new Set<string>()
    analytics.brokerGroups.forEach((g) => set.add(g.name))
    return Array.from(set).sort()
  }, [analytics.brokerGroups])

  const partyNames = useMemo(() => {
    const set = new Set<string>()
    analytics.partyGroups.forEach((g) => set.add(g.name))
    return Array.from(set).sort().slice(0, 100)
  }, [analytics.partyGroups])

  const pdfFiles = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((tx) => { if (tx.pdf_filename) set.add(tx.pdf_filename) })
    return Array.from(set).sort()
  }, [transactions])

  const months = useMemo(() => {
    return analytics.monthlyBreakdown.map((m) => m.month)
  }, [analytics.monthlyBreakdown])

  const auditCategoryCounts = useMemo(() => {
    return transactions.reduce(
      (counts, tx) => {
        counts.all += 1
        const tagTypes = new Set(tx.tags.map((tag) => tag.tag_type))
        if (tagTypes.has('client')) counts.client += 1
        if (tagTypes.has('broker')) counts.broker += 1
        if (tagTypes.has('suspicious')) counts.suspicious += 1
        return counts
      },
      { all: 0, client: 0, broker: 0, suspicious: 0 },
    )
  }, [transactions])

  type CategoryTab = 'all' | 'client' | 'broker' | 'suspicious'
  const TABS: { key: CategoryTab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: 'all', label: 'All', icon: <Layers className="h-3.5 w-3.5" strokeWidth={1.5} />, count: auditCategoryCounts.all },
    { key: 'client', label: 'Client', icon: <Users className="h-3.5 w-3.5" strokeWidth={1.5} />, count: auditCategoryCounts.client },
    { key: 'broker', label: 'Broker', icon: <Tag className="h-3.5 w-3.5" strokeWidth={1.5} />, count: auditCategoryCounts.broker },
    { key: 'suspicious', label: 'Suspicious', icon: <Shield className="h-3.5 w-3.5" strokeWidth={1.5} />, count: auditCategoryCounts.suspicious },
  ]

  return (
    <div className="bg-[var(--surface)] border-b border-[var(--border)] px-4 py-3 space-y-3">
      {/* Top row: category tabs + actions */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 bg-[var(--bg-raised)] rounded-[var(--radius-lg)] p-0.5 border border-[var(--border-subtle)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setResultFilter(tab.key)}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--radius-md)]
                transition-all duration-150
                ${resultFilter === tab.key
                  ? 'bg-[var(--surface)] text-[var(--primary)] shadow-[var(--shadow-xs)] ring-1 ring-[var(--border)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                }
              `}
            >
              {tab.icon}
              {tab.label}
              <span className="text-[10px] opacity-60 font-mono">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {count > 0 && (
          <button onClick={resetAdvancedFilters} className="btn-ghost text-xs py-1.5 text-[var(--danger)]">
            <RotateCcw className="h-3 w-3" strokeWidth={2} />
            Clear all ({count})
          </button>
        )}

        <button onClick={toggleFiltersExpanded} className="btn-icon p-1.5" title="Close filters">
          <X className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {/* Filter grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {vis.clientName && (
          <FilterSelect
            label="Client"
            value={advancedFilters.clientName}
            onChange={(v) => setAdvancedFilter('clientName', v)}
            options={clientNames.map((n) => ({ label: n, value: n.toLowerCase() }))}
          />
        )}

        {vis.brokerName && (
          <FilterSelect
            label="Broker"
            value={advancedFilters.brokerName}
            onChange={(v) => setAdvancedFilter('brokerName', v)}
            options={brokerNames.map((n) => ({ label: n, value: n.toLowerCase() }))}
          />
        )}

        {vis.partyName && (
          <FilterSelect
            label="Party"
            value={advancedFilters.partyName}
            onChange={(v) => setAdvancedFilter('partyName', v)}
            options={partyNames.map((n) => ({ label: n, value: n.toLowerCase() }))}
          />
        )}

        {vis.direction && (
          <FilterSelect
            label="Direction"
            value={advancedFilters.amountDirection}
            onChange={(v) => setAdvancedFilter('amountDirection', v as AmountDirection)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Debit', value: 'debit' },
              { label: 'Credit', value: 'credit' },
            ]}
            showAll={false}
          />
        )}

        {vis.amountRange && (
          <FilterInput
            label="Min amount"
            type="number"
            value={advancedFilters.minAmountAbs}
            onChange={(v) => setAdvancedFilter('minAmountAbs', v)}
            placeholder="₹0"
          />
        )}

        {vis.amountRange && (
          <FilterInput
            label="Max amount"
            type="number"
            value={advancedFilters.maxAmountAbs}
            onChange={(v) => setAdvancedFilter('maxAmountAbs', v)}
            placeholder="₹∞"
          />
        )}

        {vis.dateRange && (
          <FilterInput
            label="From date"
            type="date"
            value={advancedFilters.dateFrom}
            onChange={(v) => setAdvancedFilter('dateFrom', v)}
          />
        )}

        {vis.dateRange && (
          <FilterInput
            label="To date"
            type="date"
            value={advancedFilters.dateTo}
            onChange={(v) => setAdvancedFilter('dateTo', v)}
          />
        )}

        {vis.exception && (
          <FilterSelect
            label="Exception"
            value={advancedFilters.exception}
            onChange={(v) => setAdvancedFilter('exception', v as ExceptionFilter)}
            options={[
              { label: 'None', value: 'none' },
              { label: 'Untagged', value: 'untagged' },
              { label: 'Repeat party', value: 'repeat' },
              { label: 'High value', value: 'high_value' },
              { label: 'Low confidence', value: 'low_confidence' },
              { label: 'Missing party', value: 'missing_party' },
              { label: 'Cash', value: 'cash' },
              { label: 'Same day', value: 'same_day' },
              { label: 'Weekend', value: 'weekend' },
              { label: 'Round amount', value: 'round_amount' },
            ]}
            showAll={false}
          />
        )}

        {vis.tagSource && (
          <FilterSelect
            label="Tag source"
            value={advancedFilters.tagSource}
            onChange={(v) => setAdvancedFilter('tagSource', v as TagSourceFilter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Manual', value: 'manual' },
              { label: 'Auto', value: 'auto' },
            ]}
            showAll={false}
          />
        )}

        {vis.tagConfidence && (
          <FilterSelect
            label="Confidence"
            value={advancedFilters.tagConfidence}
            onChange={(v) => setAdvancedFilter('tagConfidence', v as TagConfidenceFilter)}
            options={[
              { label: 'All', value: 'all' },
              { label: 'Low (<85%)', value: 'low' },
              { label: 'High (≥85%)', value: 'high' },
            ]}
            showAll={false}
          />
        )}

        {vis.paymentMethod && (
          <FilterSelect
            label="Payment"
            value={advancedFilters.paymentMethod}
            onChange={(v) => setAdvancedFilter('paymentMethod', v)}
            options={analytics.paymentMethods.map((m) => ({
              label: m.method,
              value: m.method,
            }))}
          />
        )}

        {vis.month && (
          <FilterSelect
            label="Month"
            value={advancedFilters.month}
            onChange={(v) => setAdvancedFilter('month', v)}
            options={months.map((m) => ({ label: m, value: m }))}
          />
        )}

        {vis.pdfFile && pdfFiles.length > 1 && (
          <FilterSelect
            label="PDF file"
            value={advancedFilters.pdfFile}
            onChange={(v) => setAdvancedFilter('pdfFile', v)}
            options={pdfFiles.map((f) => ({ label: f, value: f }))}
          />
        )}

        {vis.pageRange && (
          <FilterInput
            label="Page from"
            type="number"
            value={advancedFilters.pageFrom}
            onChange={(v) => setAdvancedFilter('pageFrom', v)}
            placeholder="1"
          />
        )}

        {vis.pageRange && (
          <FilterInput
            label="Page to"
            type="number"
            value={advancedFilters.pageTo}
            onChange={(v) => setAdvancedFilter('pageTo', v)}
            placeholder="∞"
          />
        )}
      </div>

      {/* Toggle filters */}
      <div className="flex flex-wrap items-center gap-2">
        {vis.weekend && (
          <FilterToggle
            label="Weekend only"
            checked={advancedFilters.weekend}
            onChange={(v) => setAdvancedFilter('weekend', v)}
          />
        )}
        {vis.repeatClients && (
          <FilterToggle
            label="Repeat parties"
            checked={advancedFilters.showRepeatClients}
            onChange={(v) => setAdvancedFilter('showRepeatClients', v)}
          />
        )}
        {vis.suspiciousClients && (
          <FilterToggle
            label="Suspicious only"
            checked={advancedFilters.showSuspiciousClients}
            onChange={(v) => setAdvancedFilter('showSuspiciousClients', v)}
          />
        )}
        {vis.structuring && (
          <FilterToggle
            label="Many small txns"
            checked={advancedFilters.manySmallTx}
            onChange={(v) => setAdvancedFilter('manySmallTx', v)}
          />
        )}
      </div>
    </div>
  )
}


/* ── Sub-components ─────────────────────────────────────────── */

function FilterSelect({
  label,
  value,
  onChange,
  options,
  showAll = true,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
  showAll?: boolean
}) {
  const isActive = showAll ? !!value : value !== options[0]?.value

  return (
    <div className="space-y-1">
      <label className="stat-label">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`select-field text-xs py-1.5 ${isActive ? 'border-[var(--primary)]/40 bg-[var(--primary-bg)]' : ''}`}
      >
        {showAll && <option value="">All</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

function FilterInput({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
}) {
  const isActive = !!value

  return (
    <div className="space-y-1">
      <label className="stat-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-field text-xs py-1.5 ${isActive ? 'border-[var(--primary)]/40 bg-[var(--primary-bg)]' : ''}`}
      />
    </div>
  )
}

function FilterToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium
        rounded-[var(--radius-full)] border transition-all duration-150
        ${checked
          ? 'bg-[var(--primary-bg)] border-[var(--primary)]/30 text-[var(--primary)]'
          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
        }
      `}
    >
      <div
        className={`
          w-3 h-3 rounded-sm border-2 transition-all duration-150
          ${checked ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border-strong)]'}
        `}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="w-full h-full text-white">
            <path d="M3.5 6.5L5 8L8.5 4.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {label}
    </button>
  )
}
