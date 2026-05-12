import type { Transaction } from '../types/api'

export type ReviewView = 'transactions' | 'clients' | 'parties' | 'exceptions' | 'summary'
export type AmountDirection = 'all' | 'debit' | 'credit'
export type AmountType = 'all' | 'round' | 'high_value'
export type TagSourceFilter = 'all' | 'manual' | 'auto'
export type TagConfidenceFilter = 'all' | 'low' | 'high'
export type ExceptionFilter = 'none' | 'untagged' | 'repeat' | 'high_value' | 'low_confidence' | 'missing_party' | 'cash' | 'same_day'
export type ReviewStatusFilter = 'all' | 'reviewed' | 'unreviewed' | 'needs_review' | 'flagged'
export type ExportFilter = 'all' | 'exported' | 'not_exported'
export type ClientActivityType = 'all' | 'both' | 'debit_only' | 'credit_only'

export interface AdvancedFilters {
  clientName: string
  partyName: string
  amountDirection: AmountDirection
  amountType: AmountType
  dateFrom: string
  dateTo: string
  minAmountAbs: string
  maxAmountAbs: string
  pageFrom: string
  pageTo: string
  minGroupCount: string
  tagSource: TagSourceFilter
  tagConfidence: TagConfidenceFilter
  exception: ExceptionFilter
  financialYear: string
  month: string
  weekend: boolean
  sameAmountCount: string
  paymentMethod: string
  pdfFile: string
  clientActivityType: ClientActivityType
  minClientTxCount: string
  minClientAmount: string
  showRepeatClients: boolean
  showSuspiciousClients: boolean
  manySmallTx: boolean
  reviewStatus: ReviewStatusFilter
  hasNotes: boolean
  exported: ExportFilter
}

export interface AuditGroup {
  key: string
  name: string
  count: number
  debit: number
  credit: number
  net: number
  suspicious: number
  client: number
  broker: number
  untagged: number
  manual: number
  auto: number
  lowConfidence: number
  firstDate: string | null
  lastDate: string | null
}

export interface MonthlyBreakdown {
  month: string
  debit: number
  credit: number
  count: number
}

export interface PaymentMethodBreakdown {
  method: string
  count: number
  debit: number
  credit: number
}

export interface AuditAnalytics {
  filteredTransactions: Transaction[]
  clientGroups: AuditGroup[]
  partyGroups: AuditGroup[]
  exceptions: {
    untagged: number
    repeat: number
    highValue: number
    lowConfidence: number
    missingParty: number
    cash: number
    sameDay: number
  }
  totals: {
    count: number
    debit: number
    credit: number
    net: number
    tagged: number
    untagged: number
  }
  monthlyBreakdown: MonthlyBreakdown[]
  paymentMethods: PaymentMethodBreakdown[]
  topClients: { name: string; debit: number; credit: number; count: number }[]
  topParties: { name: string; debit: number; credit: number; count: number }[]
  tagDistribution: { client: number; broker: number; suspicious: number; untagged: number }
}

export const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  clientName: '',
  partyName: '',
  amountDirection: 'all',
  amountType: 'all',
  dateFrom: '',
  dateTo: '',
  minAmountAbs: '',
  maxAmountAbs: '',
  pageFrom: '',
  pageTo: '',
  minGroupCount: '',
  tagSource: 'all',
  tagConfidence: 'all',
  exception: 'none',
  financialYear: '',
  month: '',
  weekend: false,
  sameAmountCount: '',
  paymentMethod: '',
  pdfFile: '',
  clientActivityType: 'all',
  minClientTxCount: '',
  minClientAmount: '',
  showRepeatClients: false,
  showSuspiciousClients: false,
  manySmallTx: false,
  reviewStatus: 'all',
  hasNotes: false,
  exported: 'all',
}

const KNOWN_PAYMENT_METHODS = [
  { regex: /\bNEFT\b/i, method: 'NEFT' },
  { regex: /\bRTGS\b/i, method: 'RTGS' },
  { regex: /\bIMPS\b/i, method: 'IMPS' },
  { regex: /\bUPI\b/i, method: 'UPI' },
  { regex: /\bCASH\b/i, method: 'CASH' },
  { regex: /\bCHEQUE\b|\bCHQ\b|\bCH\.?\b/i, method: 'CHEQUE' },
  { regex: /\bECS\b/i, method: 'ECS' },
  { regex: /\bATM\b/i, method: 'ATM' },
  { regex: /\bPOS\b/i, method: 'POS' },
  { regex: /\bSWIFT\b/i, method: 'SWIFT' },
  { regex: /\bBD\b|\bBILL DISCOUNT/i, method: 'BILL_DISCOUNT' },
]

function normalize(text: string | null | undefined): string {
  return (text || '').trim().replace(/\s+/g, ' ')
}

export function groupKey(text: string | null | undefined): string {
  const cleaned = normalize(text)
  return cleaned ? cleaned.toLowerCase() : 'unknown'
}

export function displayName(text: string | null | undefined): string {
  return normalize(text) || 'Unknown'
}

function parseDate(value: string | null): number | null {
  if (!value) return null
  const cleaned = value.trim()
  const formats = [
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/,
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
  ]
  const dmy = cleaned.match(formats[0])
  if (dmy) {
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3])
    return new Date(year, Number(dmy[2]) - 1, Number(dmy[1])).getTime()
  }
  const ymd = cleaned.match(formats[1])
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3])).getTime()
  const parsed = Date.parse(cleaned)
  return Number.isNaN(parsed) ? null : parsed
}

function isoDateToTime(value: string): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function amountAbs(tx: Transaction): number {
  return Math.abs(tx.amount ?? 0)
}

function primaryTag(tx: Transaction) {
  return tx.tags?.[0] ?? null
}

function isLowConfidence(tx: Transaction): boolean {
  return tx.tags.length > 0 && tx.tags.some((tag) => tag.confidence < 0.85)
}

function isHighConfidence(tx: Transaction): boolean {
  return tx.tags.length > 0 && tx.tags.every((tag) => tag.confidence >= 0.85)
}

function isCash(tx: Transaction): boolean {
  const text = `${tx.party_name || ''} ${tx.description || ''}`.toLowerCase()
  return text.includes('cash')
}

function transactionText(tx: Transaction): string {
  return `${tx.party_name || ''} ${tx.description || ''} ${tx.date || ''} ${tx.amount ?? ''}`.toLowerCase()
}

function isRoundAmount(amount: number): boolean {
  const abs = Math.abs(amount)
  if (abs === 0) return false
  if (abs % 100000 === 0) return true
  if (abs % 10000 === 0) return true
  if (abs % 1000 === 0) return true
  if (abs % 500 === 0) return true
  if (abs % 100 === 0) return true
  return false
}

function detectPaymentMethod(tx: Transaction): string {
  const text = `${tx.description || ''} ${tx.party_name || ''} ${tx.raw_text || ''}`
  for (const { regex, method } of KNOWN_PAYMENT_METHODS) {
    if (regex.test(text)) return method
  }
  return 'OTHER'
}

function getFinancialYear(date: string | null): string | null {
  if (!date) return null
  const time = parseDate(date)
  if (!time) return null
  const d = new Date(time)
  const year = d.getFullYear()
  const month = d.getMonth()
  if (month >= 3) {
    return `${year}-${(year + 1).toString().slice(2)}`
  } else {
    return `${year - 1}-${year.toString().slice(2)}`
  }
}

function getMonth(date: string | null): string | null {
  if (!date) return null
  const time = parseDate(date)
  if (!time) return null
  const d = new Date(time)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isWeekend(date: string | null): boolean {
  if (!date) return false
  const time = parseDate(date)
  if (!time) return false
  const d = new Date(time)
  const day = d.getDay()
  return day === 0 || day === 6
}

export function extractTagMatchedName(reason: string | null): string | null {
  if (!reason) return null
  let match = reason.match(/'([^']+)'/)
  if (match) return match[1]
  match = reason.match(/->\s*(.+)$/)
  if (match) return match[1].trim()
  return null
}

function clientDisplayName(tx: Transaction): string {
  const clientTag = tx.tags.find((t) => t.tag_type === 'client')
  if (clientTag) {
    const matched = extractTagMatchedName(clientTag.reason)
    if (matched) return matched
  }
  return tx.party_name || 'Unknown'
}

function makeGroup(name: string): AuditGroup {
  return {
    key: groupKey(name),
    name: displayName(name),
    count: 0,
    debit: 0,
    credit: 0,
    net: 0,
    suspicious: 0,
    client: 0,
    broker: 0,
    untagged: 0,
    manual: 0,
    auto: 0,
    lowConfidence: 0,
    firstDate: null,
    lastDate: null,
  }
}

function addToGroup(group: AuditGroup, tx: Transaction) {
  const amount = tx.amount ?? 0
  const tag = primaryTag(tx)
  const time = parseDate(tx.date)
  group.count += 1
  if (amount < 0) group.debit += Math.abs(amount)
  if (amount > 0) group.credit += amount
  group.net += amount
  if (tag?.tag_type === 'suspicious') group.suspicious += 1
  if (tag?.tag_type === 'client') group.client += 1
  if (tag?.tag_type === 'broker') group.broker += 1
  if (!tag) group.untagged += 1
  if (tx.tags.some((t) => t.is_manual || t.source === 'manual')) group.manual += 1
  if (tx.tags.some((t) => !t.is_manual && t.source !== 'manual')) group.auto += 1
  if (isLowConfidence(tx)) group.lowConfidence += 1
  if (time !== null) {
    if (!group.firstDate || (parseDate(group.firstDate) ?? Infinity) > time) group.firstDate = tx.date
    if (!group.lastDate || (parseDate(group.lastDate) ?? -Infinity) < time) group.lastDate = tx.date
  }
}

function grouped(transactions: Transaction[], getName: (tx: Transaction) => string): AuditGroup[] {
  const map = new Map<string, AuditGroup>()
  for (const tx of transactions) {
    const name = getName(tx)
    const key = groupKey(name)
    const group = map.get(key) ?? makeGroup(name)
    addToGroup(group, tx)
    map.set(key, group)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count || (b.debit + b.credit) - (a.debit + a.credit))
}

function repeatKeys(transactions: Transaction[], getName: (tx: Transaction) => string): Set<string> {
  const counts = new Map<string, number>()
  for (const tx of transactions) counts.set(groupKey(getName(tx)), (counts.get(groupKey(getName(tx))) ?? 0) + 1)
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key))
}

function sameDayKeys(transactions: Transaction[]): Set<string> {
  const counts = new Map<string, number>()
  for (const tx of transactions) {
    const key = `${groupKey(tx.party_name)}:${tx.date || 'unknown'}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key))
}

function sameAmountKeys(transactions: Transaction[]): Set<number> {
  const counts = new Map<number, number>()
  for (const tx of transactions) {
    const amt = tx.amount ?? 0
    counts.set(amt, (counts.get(amt) ?? 0) + 1)
  }
  return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([key]) => key))
}

function manySmallTxKeys(transactions: Transaction[], threshold: number): Set<string> {
  const clientMap = new Map<string, { count: number; totalAmount: number }>()
  for (const tx of transactions) {
    if ((tx.amount ?? 0) >= 0) continue
    const key = groupKey(tx.party_name)
    const entry = clientMap.get(key) ?? { count: 0, totalAmount: 0 }
    entry.count += 1
    entry.totalAmount += Math.abs(tx.amount ?? 0)
    clientMap.set(key, entry)
  }
  return new Set(
    Array.from(clientMap.entries())
      .filter(([, v]) => v.count >= 5 && v.totalAmount > 0 && v.totalAmount / v.count < threshold)
      .map(([key]) => key)
  )
}

function clientsWithBothActivity(transactions: Transaction[]): Set<string> {
  const debit = new Set<string>()
  const credit = new Set<string>()
  for (const tx of transactions) {
    const key = groupKey(tx.party_name)
    const amt = tx.amount ?? 0
    if (amt < 0) debit.add(key)
    if (amt > 0) credit.add(key)
  }
  return new Set([...debit].filter((k) => credit.has(k)))
}

function buildMonthlyBreakdown(txns: Transaction[]): MonthlyBreakdown[] {
  const map = new Map<string, MonthlyBreakdown>()
  for (const tx of txns) {
    const month = getMonth(tx.date) || 'unknown'
    const entry = map.get(month) ?? { month, debit: 0, credit: 0, count: 0 }
    const amt = tx.amount ?? 0
    entry.count += 1
    if (amt < 0) entry.debit += Math.abs(amt)
    if (amt > 0) entry.credit += amt
    map.set(month, entry)
  }
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month))
}

function buildPaymentMethodBreakdown(txns: Transaction[]): PaymentMethodBreakdown[] {
  const map = new Map<string, PaymentMethodBreakdown>()
  for (const tx of txns) {
    const method = detectPaymentMethod(tx)
    const entry = map.get(method) ?? { method, count: 0, debit: 0, credit: 0 }
    const amt = tx.amount ?? 0
    entry.count += 1
    if (amt < 0) entry.debit += Math.abs(amt)
    if (amt > 0) entry.credit += amt
    map.set(method, entry)
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count)
}

export function buildAuditAnalytics(
  transactions: Transaction[],
  searchQuery: string,
  filterTags: string[],
  filters: AdvancedFilters,
  suspiciousThreshold: number
): AuditAnalytics {
  const repeatParties = repeatKeys(transactions, (tx) => tx.party_name || tx.description || 'Unknown')
  const sameDayParties = sameDayKeys(transactions)
  const sameAmounts = sameAmountKeys(transactions)
  const bothActivity = clientsWithBothActivity(transactions)
  const minAbs = filters.minAmountAbs ? Number(filters.minAmountAbs) : null
  const maxAbs = filters.maxAmountAbs ? Number(filters.maxAmountAbs) : null
  const pageFrom = filters.pageFrom ? Number(filters.pageFrom) : null
  const pageTo = filters.pageTo ? Number(filters.pageTo) : null
  const dateFrom = isoDateToTime(filters.dateFrom)
  const dateTo = isoDateToTime(filters.dateTo)
  const minGroupCount = filters.minGroupCount ? Number(filters.minGroupCount) : null
  const sameAmountCount = filters.sameAmountCount ? Number(filters.sameAmountCount) : null
  const manySmallTxSet = manySmallTxKeys(transactions, suspiciousThreshold)

  const filteredTransactions = transactions.filter((tx) => {
    const tag = primaryTag(tx)
    const partyKey = groupKey(tx.party_name || tx.description)

    if (searchQuery && !transactionText(tx).includes(searchQuery.toLowerCase())) return false
    if (filterTags.length > 0 && !filterTags.some((ft) => tx.tags.some((txTag) => txTag.tag_type === ft))) return false

    if (filters.clientName && groupKey(tx.party_name) !== filters.clientName) return false
    if (filters.partyName && partyKey !== filters.partyName) return false

    if (filters.amountDirection === 'debit' && (tx.amount ?? 0) >= 0) return false
    if (filters.amountDirection === 'credit' && (tx.amount ?? 0) <= 0) return false

    if (filters.amountType === 'high_value' && amountAbs(tx) < suspiciousThreshold) return false
    if (filters.amountType === 'round' && !isRoundAmount(tx.amount ?? 0)) return false

    if (minAbs !== null && amountAbs(tx) < minAbs) return false
    if (maxAbs !== null && amountAbs(tx) > maxAbs) return false

    if (pageFrom !== null && (tx.page_number ?? 0) < pageFrom) return false
    if (pageTo !== null && (tx.page_number ?? 0) > pageTo) return false

    const txTime = parseDate(tx.date)
    if (dateFrom !== null && txTime !== null && txTime < dateFrom) return false
    if (dateTo !== null && txTime !== null && txTime > dateTo) return false

    if (filters.financialYear && getFinancialYear(tx.date) !== filters.financialYear) return false
    if (filters.month && getMonth(tx.date) !== filters.month) return false
    if (filters.weekend && !isWeekend(tx.date)) return false

    if (sameAmountCount !== null) {
      const count = tx.amount !== null ? Array.from(sameAmounts).filter((a) => Math.abs(a) === Math.abs(tx.amount!)).length : 0
      if (count < sameAmountCount) return false
    }

    if (filters.paymentMethod && detectPaymentMethod(tx) !== filters.paymentMethod) return false
    if (filters.pdfFile && tx.pdf_filename !== filters.pdfFile) return false

    if (filters.tagSource === 'manual' && !tx.tags.some((t) => t.is_manual || t.source === 'manual')) return false
    if (filters.tagSource === 'auto' && !tx.tags.some((t) => !t.is_manual && t.source !== 'manual')) return false

    if (filters.tagConfidence === 'low' && !isLowConfidence(tx)) return false
    if (filters.tagConfidence === 'high' && !isHighConfidence(tx)) return false

    if (filters.clientActivityType === 'both' && !bothActivity.has(partyKey)) return false
    if (filters.clientActivityType === 'debit_only' && creditHas(transactions, partyKey)) return false
    if (filters.clientActivityType === 'credit_only' && debitHas(transactions, partyKey)) return false

    if (filters.showRepeatClients && !repeatParties.has(partyKey)) return false
    if (filters.showSuspiciousClients && !tx.tags.some((t) => t.tag_type === 'suspicious')) return false

    if (filters.manySmallTx && !manySmallTxSet.has(partyKey)) return false

    if (filters.reviewStatus === 'reviewed' && !tx.review_status) {
      if (filters.reviewStatus === 'reviewed' && !tx.review_status) return false
    }
    if (filters.reviewStatus === 'unreviewed' && tx.review_status === 'reviewed') return false
    if (filters.reviewStatus === 'needs_review' && tx.review_status !== 'needs_review') return false
    if (filters.reviewStatus === 'flagged' && tx.review_status !== 'flagged') return false

    if (filters.hasNotes && !tx.user_notes) return false

    if (filters.exported === 'exported' && !tx.exported_at) return false
    if (filters.exported === 'not_exported' && tx.exported_at) return false

    if (filters.exception === 'untagged' && tag) return false
    if (filters.exception === 'repeat' && !repeatParties.has(partyKey)) return false
    if (filters.exception === 'high_value' && amountAbs(tx) < suspiciousThreshold) return false
    if (filters.exception === 'low_confidence' && !isLowConfidence(tx)) return false
    if (filters.exception === 'missing_party' && normalize(tx.party_name).length > 0) return false
    if (filters.exception === 'cash' && !isCash(tx)) return false
    if (filters.exception === 'same_day' && !sameDayParties.has(`${groupKey(tx.party_name)}:${tx.date || 'unknown'}`)) return false

    return true
  })

  let clientGroups = grouped(
    filteredTransactions.filter((tx) => tx.tags.some((tag) => tag.tag_type === 'client')),
    (tx) => clientDisplayName(tx)
  )
  let partyGroups = grouped(filteredTransactions, (tx) => tx.party_name || tx.description || 'Unknown')

  if (minGroupCount !== null) {
    clientGroups = clientGroups.filter((g) => g.count >= minGroupCount)
    partyGroups = partyGroups.filter((g) => g.count >= minGroupCount)
  }

  if (filters.minClientTxCount) {
    const min = Number(filters.minClientTxCount)
    clientGroups = clientGroups.filter((g) => g.count >= min)
  }

  if (filters.minClientAmount) {
    const min = Number(filters.minClientAmount)
    clientGroups = clientGroups.filter((g) => g.debit >= min || g.credit >= min)
  }

  const totals = filteredTransactions.reduce(
    (acc, tx) => {
      const amount = tx.amount ?? 0
      acc.count += 1
      if (amount < 0) acc.debit += Math.abs(amount)
      if (amount > 0) acc.credit += amount
      acc.net += amount
      if (tx.tags.length > 0) acc.tagged += 1
      else acc.untagged += 1
      return acc
    },
    { count: 0, debit: 0, credit: 0, net: 0, tagged: 0, untagged: 0 }
  )

  const exceptions = {
    untagged: filteredTransactions.filter((tx) => tx.tags.length === 0).length,
    repeat: filteredTransactions.filter((tx) => repeatParties.has(groupKey(tx.party_name || tx.description))).length,
    highValue: filteredTransactions.filter((tx) => amountAbs(tx) >= suspiciousThreshold).length,
    lowConfidence: filteredTransactions.filter(isLowConfidence).length,
    missingParty: filteredTransactions.filter((tx) => !normalize(tx.party_name)).length,
    cash: filteredTransactions.filter(isCash).length,
    sameDay: filteredTransactions.filter((tx) => sameDayParties.has(`${groupKey(tx.party_name)}:${tx.date || 'unknown'}`)).length,
  }

  const monthlyBreakdown = buildMonthlyBreakdown(filteredTransactions)
  const paymentMethods = buildPaymentMethodBreakdown(filteredTransactions)

  const topClients = clientGroups
    .slice(0, 10)
    .map((g) => ({ name: g.name, debit: g.debit, credit: g.credit, count: g.count }))

  const topParties = partyGroups
    .slice(0, 10)
    .map((g) => ({ name: g.name, debit: g.debit, credit: g.credit, count: g.count }))

  const tagDistribution = {
    client: filteredTransactions.filter((tx) => tx.tags.some((t) => t.tag_type === 'client')).length,
    broker: filteredTransactions.filter((tx) => tx.tags.some((t) => t.tag_type === 'broker')).length,
    suspicious: filteredTransactions.filter((tx) => tx.tags.some((t) => t.tag_type === 'suspicious')).length,
    untagged: filteredTransactions.filter((tx) => tx.tags.length === 0).length,
  }

  return {
    filteredTransactions,
    clientGroups,
    partyGroups,
    exceptions,
    totals,
    monthlyBreakdown,
    paymentMethods,
    topClients,
    topParties,
    tagDistribution,
  }
}

function creditHas(txns: Transaction[], key: string): boolean {
  return txns.some((tx) => groupKey(tx.party_name) === key && (tx.amount ?? 0) > 0)
}

function debitHas(txns: Transaction[], key: string): boolean {
  return txns.some((tx) => groupKey(tx.party_name) === key && (tx.amount ?? 0) < 0)
}
