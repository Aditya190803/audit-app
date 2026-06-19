import { Building2 } from 'lucide-react'

interface ParserSelectProps {
  parsers: { name: string; display_name: string }[]
  value: string
  onChange: (value: string) => void
}

export function ParserSelect({ parsers, value, onChange }: ParserSelectProps) {
  if (parsers.length === 0) return null

  return (
    <div className="border-t border-[var(--border)] pt-6">
      <div className="flex items-center gap-2 mb-3">
        <Building2 className="h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Bank Format</span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field w-full"
      >
        <option value="">Auto-Detect (Recommended)</option>
        {parsers.filter((p) => p.name !== 'generic').map((p) => (
          <option key={p.name} value={p.name}>{p.display_name}</option>
        ))}
      </select>
    </div>
  )
}
