export interface Transaction {
  id: number
  session_id: number
  date: string | null
  amount: number | null
  description: string | null
  party_name: string | null
  raw_text: string | null
  page_number: number | null
  tags: Tag[]
  created_at: string
}

export interface Tag {
  id: number
  transaction_id: number
  tag_type: 'client' | 'broker' | 'suspicious'
  confidence: number
  reason: string | null
  source: string
  is_manual: boolean
  created_at: string
}

export interface Broker {
  id: number
  name: string
  aliases: string[]
  is_active: boolean
  created_at: string
}

export interface Alias {
  id: number
  canonical_name: string
  alias_name: string
  created_at: string
}

export interface AuditSession {
  id: number
  name: string | null
  created_at: string
  updated_at: string
  status: string
  pdf_path: string | null
  csv_path: string | null
  settings_snapshot: Record<string, unknown>
  transaction_count?: number
}

export interface AuditLog {
  id: number
  session_id: number | null
  action: string
  entity_type: string
  entity_id: number | null
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  timestamp: string
  is_auto: boolean
}

export interface ConfigItem {
  key: string
  value: unknown
  category: string
}

export interface BankProfile {
  id: number
  name: string
  parser_rules_json: Record<string, unknown>
  created_at: string
}

export interface HealthResponse {
  status: string
  version: string
}

export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
}

export interface TagSummary {
  client: number
  broker: number
  suspicious: number
  total_tagged: number
  total_transactions: number
}

export type ExportType = 'all' | 'client' | 'broker' | 'suspicious' | 'tagged'
export type ExportFormat = 'csv' | 'excel' | 'pdf-highlight' | 'pdf-report'
