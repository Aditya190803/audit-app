import React from 'react'
import { Filter, Search, X, ChevronDown, ChevronUp, IndianRupee, Calendar, Users, FileText } from 'lucide-react'
import { type AdvancedFilters, type AmountDirection, type AmountType, type TagSourceFilter, type TagConfidenceFilter, type ClientActivityType, type ExceptionFilter } from '../utils/auditAnalytics'

interface SearchFiltersProps {
  searchQuery: string
  filterTags: string[]
  advancedFilters: AdvancedFilters
  filtersExpanded: boolean
  clientOptions: { key: string; name: string; count: number }[]
  partyOptions: { key: string; name: string; count: number }[]
  pdfOptions: { key: string; name: string; count: number }[]
  activeFilterCount: number
  onSearchChange: (q: string) => void
  onAdvancedFilterChange: <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => void
  onClearFilters: () => void
  onToggleFiltersExpanded: () => void
  onRemoveFilterTag: (tag: string) => void
}

const FINANCIAL_YEARS = [
  '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26', '2026-27',
]

const MONTHS = [
  '2025-01', '2025-02', '2025-03', '2025-04', '2025-05', '2025-06',
  '2025-07', '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
]

const MONTH_LABELS: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

function monthLabel(value: string): string {
  const [, m] = value.split('-')
  return `${MONTH_LABELS[m] || m} ${value.slice(0, 4)}`
}

const PAYMENT_METHODS = ['NEFT', 'RTGS', 'IMPS', 'UPI', 'CASH', 'CHEQUE', 'ECS', 'ATM', 'POS', 'SWIFT', 'OTHER']

/* ── Tiny labeled wrapper for each filter control ─────────────── */
const FilterField: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <div className={`space-y-1 ${className}`}>
    <label className="filter-label">{label}</label>
    {children}
  </div>
)

/* ── Section header with icon ─────────────────────────────────── */
const SectionHeader: React.FC<{ icon: React.ReactNode; title: string }> = ({ icon, title }) => (
  <div className="filter-section-header">
    {icon}
    <span>{title}</span>
  </div>
)

/* ── Toggle pill button (replaces raw checkboxes) ─────────────── */
const TogglePill: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    data-active={active}
    className="filter-toggle"
  >
    {children}
  </button>
)

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchQuery,
  filterTags,
  advancedFilters,
  filtersExpanded,
  clientOptions,
  partyOptions,
  pdfOptions,
  activeFilterCount,
  onSearchChange,
  onAdvancedFilterChange,
  onClearFilters,
  onToggleFiltersExpanded,
  onRemoveFilterTag,
}) => {
  const hasFilters = activeFilterCount > 0

  /* ── Build active-filter chip list ──────────────────────────── */
  const activeChips: { label: string; onRemove: () => void }[] = []

  if (searchQuery) {
    activeChips.push({ label: `"${searchQuery}"`, onRemove: () => onSearchChange('') })
  }
  for (const tag of filterTags) {
    activeChips.push({ label: `Tag: ${tag}`, onRemove: () => onRemoveFilterTag(tag) })
  }
  if (advancedFilters.clientName) {
    const client = clientOptions.find((c) => c.key === advancedFilters.clientName)
    activeChips.push({ label: `Client: ${client?.name || advancedFilters.clientName}`, onRemove: () => onAdvancedFilterChange('clientName', '') })
  }
  if (advancedFilters.partyName) {
    const party = partyOptions.find((p) => p.key === advancedFilters.partyName)
    activeChips.push({ label: `Party: ${party?.name || advancedFilters.partyName}`, onRemove: () => onAdvancedFilterChange('partyName', '') })
  }
  if (advancedFilters.amountDirection !== 'all') {
    activeChips.push({ label: `${advancedFilters.amountDirection} only`, onRemove: () => onAdvancedFilterChange('amountDirection', 'all' as AmountDirection) })
  }
  if (advancedFilters.amountType !== 'all') {
    activeChips.push({ label: advancedFilters.amountType === 'high_value' ? 'High value' : 'Round amounts', onRemove: () => onAdvancedFilterChange('amountType', 'all' as AmountType) })
  }
  if (advancedFilters.dateFrom) {
    activeChips.push({ label: `From: ${advancedFilters.dateFrom}`, onRemove: () => onAdvancedFilterChange('dateFrom', '') })
  }
  if (advancedFilters.dateTo) {
    activeChips.push({ label: `To: ${advancedFilters.dateTo}`, onRemove: () => onAdvancedFilterChange('dateTo', '') })
  }
  if (advancedFilters.minAmountAbs) {
    activeChips.push({ label: `Min: ₹${advancedFilters.minAmountAbs}`, onRemove: () => onAdvancedFilterChange('minAmountAbs', '') })
  }
  if (advancedFilters.maxAmountAbs) {
    activeChips.push({ label: `Max: ₹${advancedFilters.maxAmountAbs}`, onRemove: () => onAdvancedFilterChange('maxAmountAbs', '') })
  }
  if (advancedFilters.exception !== 'none') {
    activeChips.push({ label: advancedFilters.exception.replace(/_/g, ' '), onRemove: () => onAdvancedFilterChange('exception', 'none') })
  }
  if (advancedFilters.financialYear) {
    activeChips.push({ label: `FY ${advancedFilters.financialYear}`, onRemove: () => onAdvancedFilterChange('financialYear', '') })
  }
  if (advancedFilters.month) {
    activeChips.push({ label: monthLabel(advancedFilters.month), onRemove: () => onAdvancedFilterChange('month', '') })
  }
  if (advancedFilters.weekend) {
    activeChips.push({ label: 'Weekend', onRemove: () => onAdvancedFilterChange('weekend', false) })
  }
  if (advancedFilters.paymentMethod) {
    activeChips.push({ label: advancedFilters.paymentMethod, onRemove: () => onAdvancedFilterChange('paymentMethod', '') })
  }
  if (advancedFilters.tagSource !== 'all') {
    activeChips.push({ label: `${advancedFilters.tagSource} tags`, onRemove: () => onAdvancedFilterChange('tagSource', 'all' as TagSourceFilter) })
  }
  if (advancedFilters.tagConfidence !== 'all') {
    activeChips.push({ label: `${advancedFilters.tagConfidence} confidence`, onRemove: () => onAdvancedFilterChange('tagConfidence', 'all' as TagConfidenceFilter) })
  }
  if (advancedFilters.clientActivityType !== 'all') {
    activeChips.push({ label: advancedFilters.clientActivityType.replace(/_/g, ' '), onRemove: () => onAdvancedFilterChange('clientActivityType', 'all' as ClientActivityType) })
  }
  if (advancedFilters.pdfFile) {
    const pdf = pdfOptions.find((p) => p.key === advancedFilters.pdfFile)
    activeChips.push({ label: `PDF: ${pdf?.name || advancedFilters.pdfFile}`, onRemove: () => onAdvancedFilterChange('pdfFile', '') })
  }

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]">
      {/* ── Search bar row ────────────────────────────────────── */}
      <div className="px-3 py-2.5 flex items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)] transition-shadow duration-150"
          />
        </div>

        <select
          value={advancedFilters.clientName}
          onChange={(e) => onAdvancedFilterChange('clientName', e.target.value)}
          className="filter-control max-w-[220px] flex-none"
        >
          <option value="">All clients</option>
          {clientOptions.map((client) => (
            <option key={client.key} value={client.key}>{client.name} ({client.count})</option>
          ))}
        </select>

        <select
          value={advancedFilters.exception}
          onChange={(e) => onAdvancedFilterChange('exception', e.target.value as ExceptionFilter)}
          className="filter-control max-w-[180px] flex-none"
        >
          <option value="none">All review states</option>
          <option value="untagged">Untagged</option>
          <option value="repeat">Repeat parties</option>
          <option value="high_value">High value</option>
          <option value="low_confidence">Low confidence</option>
          <option value="missing_party">Missing party</option>
          <option value="cash">Cash</option>
          <option value="same_day">Same-day repeats</option>
        </select>

        <button
          onClick={onToggleFiltersExpanded}
          className={`flex items-center gap-1.5 h-8 px-2.5 text-xs font-medium rounded-[var(--radius-md)] border transition-colors duration-150 ${
            filtersExpanded || hasFilters
              ? 'bg-[var(--primary-subtle)] text-[var(--primary)] border-[var(--primary)]/30'
              : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--border-strong)]'
          }`}
        >
          <Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 font-semibold">
              {activeFilterCount}
            </span>
          )}
          {filtersExpanded ? <ChevronUp className="h-3 w-3" strokeWidth={2} /> : <ChevronDown className="h-3 w-3" strokeWidth={2} />}
        </button>

        {hasFilters && (
          <button onClick={onClearFilters} className="btn-ghost text-xs">
            <X className="h-3 w-3" strokeWidth={2} />
            Clear
          </button>
        )}
      </div>

      {/* ── Active filter chips ────────────────────────────────── */}
      {activeChips.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-[var(--primary-subtle)] text-[var(--primary)] rounded-full border border-[var(--primary)]/20"
            >
              {chip.label}
              <button onClick={chip.onRemove} className="hover:bg-[var(--primary)]/10 rounded-full p-0.5">
                <X className="h-2.5 w-2.5" strokeWidth={3} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Expanded advanced filters ─────────────────────────── */}
      {filtersExpanded && (
        <div className="px-3 pb-3 animate-fade-in-down">

          {/* ─── Section 1: Amount & Type ─────────────────────── */}
          <div className="border-t border-[var(--border)] pt-2.5 pb-3">
            <SectionHeader
              icon={<IndianRupee className="h-3.5 w-3.5" strokeWidth={1.5} />}
              title="Amount & Type"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1.5">
              <FilterField label="Direction">
                <select
                  value={advancedFilters.amountDirection}
                  onChange={(e) => onAdvancedFilterChange('amountDirection', e.target.value as AmountDirection)}
                  className="filter-control"
                >
                  <option value="all">Debit & Credit</option>
                  <option value="debit">Debit only</option>
                  <option value="credit">Credit only</option>
                </select>
              </FilterField>
              <FilterField label="Amount type">
                <select
                  value={advancedFilters.amountType}
                  onChange={(e) => onAdvancedFilterChange('amountType', e.target.value as AmountType)}
                  className="filter-control"
                >
                  <option value="all">All amounts</option>
                  <option value="high_value">High value</option>
                  <option value="round">Round amounts</option>
                </select>
              </FilterField>
              <FilterField label="Min amount (₹)">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 10000"
                  value={advancedFilters.minAmountAbs}
                  onChange={(e) => onAdvancedFilterChange('minAmountAbs', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Max amount (₹)">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 500000"
                  value={advancedFilters.maxAmountAbs}
                  onChange={(e) => onAdvancedFilterChange('maxAmountAbs', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
            </div>
          </div>

          {/* ─── Section 2: Date & Period ─────────────────────── */}
          <div className="border-t border-[var(--border)] pt-2.5 pb-3">
            <SectionHeader
              icon={<Calendar className="h-3.5 w-3.5" strokeWidth={1.5} />}
              title="Date & Period"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-1.5">
              <FilterField label="From date">
                <input
                  type="date"
                  value={advancedFilters.dateFrom}
                  onChange={(e) => onAdvancedFilterChange('dateFrom', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="To date">
                <input
                  type="date"
                  value={advancedFilters.dateTo}
                  onChange={(e) => onAdvancedFilterChange('dateTo', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Financial year">
                <select
                  value={advancedFilters.financialYear}
                  onChange={(e) => onAdvancedFilterChange('financialYear', e.target.value)}
                  className="filter-control"
                >
                  <option value="">All FY</option>
                  {FINANCIAL_YEARS.map((fy) => (
                    <option key={fy} value={fy}>{fy}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Month">
                <select
                  value={advancedFilters.month}
                  onChange={(e) => onAdvancedFilterChange('month', e.target.value)}
                  className="filter-control"
                >
                  <option value="">All months</option>
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </select>
              </FilterField>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              <TogglePill
                active={advancedFilters.weekend}
                onClick={() => onAdvancedFilterChange('weekend', !advancedFilters.weekend)}
              >
                Weekend only
              </TogglePill>
            </div>
          </div>

          {/* ─── Section 3: Party & Source ─────────────────────── */}
          <div className="border-t border-[var(--border)] pt-2.5 pb-3">
            <SectionHeader
              icon={<Users className="h-3.5 w-3.5" strokeWidth={1.5} />}
              title="Party & Source"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-1.5">
              <FilterField label="Party">
                <select
                  value={advancedFilters.partyName}
                  onChange={(e) => onAdvancedFilterChange('partyName', e.target.value)}
                  className="filter-control"
                >
                  <option value="">All parties</option>
                  {partyOptions.slice(0, 250).map((party) => (
                    <option key={party.key} value={party.key}>{party.name} ({party.count})</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Tag source">
                <select
                  value={advancedFilters.tagSource}
                  onChange={(e) => onAdvancedFilterChange('tagSource', e.target.value as TagSourceFilter)}
                  className="filter-control"
                >
                  <option value="all">Any source</option>
                  <option value="manual">Manual tags</option>
                  <option value="auto">Auto tags</option>
                </select>
              </FilterField>
              <FilterField label="Confidence">
                <select
                  value={advancedFilters.tagConfidence}
                  onChange={(e) => onAdvancedFilterChange('tagConfidence', e.target.value as TagConfidenceFilter)}
                  className="filter-control"
                >
                  <option value="all">Any confidence</option>
                  <option value="high">High confidence</option>
                  <option value="low">Low confidence</option>
                </select>
              </FilterField>
              <FilterField label="Payment method">
                <select
                  value={advancedFilters.paymentMethod}
                  onChange={(e) => onAdvancedFilterChange('paymentMethod', e.target.value)}
                  className="filter-control"
                >
                  <option value="">All methods</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Client activity">
                <select
                  value={advancedFilters.clientActivityType}
                  onChange={(e) => onAdvancedFilterChange('clientActivityType', e.target.value as ClientActivityType)}
                  className="filter-control"
                >
                  <option value="all">All activity</option>
                  <option value="both">Debit & Credit</option>
                  <option value="debit_only">Debit only</option>
                  <option value="credit_only">Credit only</option>
                </select>
              </FilterField>
            </div>
          </div>

          {/* ─── Section 4: Document & Advanced ───────────────── */}
          <div className="border-t border-[var(--border)] pt-2.5 pb-1">
            <SectionHeader
              icon={<FileText className="h-3.5 w-3.5" strokeWidth={1.5} />}
              title="Document & Advanced"
            />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mt-1.5">
              <FilterField label="PDF file">
                <select
                  value={advancedFilters.pdfFile}
                  onChange={(e) => onAdvancedFilterChange('pdfFile', e.target.value)}
                  className="filter-control"
                >
                  <option value="">All PDFs</option>
                  {pdfOptions.map((pdf) => (
                    <option key={pdf.key} value={pdf.key}>{pdf.name} ({pdf.count})</option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Min page">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 1"
                  value={advancedFilters.pageFrom}
                  onChange={(e) => onAdvancedFilterChange('pageFrom', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Max page">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 50"
                  value={advancedFilters.pageTo}
                  onChange={(e) => onAdvancedFilterChange('pageTo', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Min group count">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 3"
                  value={advancedFilters.minGroupCount}
                  onChange={(e) => onAdvancedFilterChange('minGroupCount', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Same amt. count">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 5"
                  value={advancedFilters.sameAmountCount}
                  onChange={(e) => onAdvancedFilterChange('sameAmountCount', e.target.value)}
                  className="filter-control"
                  title="Filter transactions with same amount appearing N+ times"
                />
              </FilterField>
            </div>

            {/* Advanced thresholds row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <FilterField label="Min client tx count">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 10"
                  value={advancedFilters.minClientTxCount}
                  onChange={(e) => onAdvancedFilterChange('minClientTxCount', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
              <FilterField label="Min client total (₹)">
                <input
                  inputMode="numeric"
                  placeholder="e.g. 100000"
                  value={advancedFilters.minClientAmount}
                  onChange={(e) => onAdvancedFilterChange('minClientAmount', e.target.value)}
                  className="filter-control"
                />
              </FilterField>
            </div>

            {/* Toggle pills for boolean filters */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <TogglePill
                active={advancedFilters.showRepeatClients}
                onClick={() => onAdvancedFilterChange('showRepeatClients', !advancedFilters.showRepeatClients)}
              >
                Repeat clients
              </TogglePill>
              <TogglePill
                active={advancedFilters.showSuspiciousClients}
                onClick={() => onAdvancedFilterChange('showSuspiciousClients', !advancedFilters.showSuspiciousClients)}
              >
                Suspicious clients
              </TogglePill>
              <TogglePill
                active={advancedFilters.manySmallTx}
                onClick={() => onAdvancedFilterChange('manySmallTx', !advancedFilters.manySmallTx)}
              >
                Structuring (many small tx)
              </TogglePill>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
