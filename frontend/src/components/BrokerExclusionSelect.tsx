import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

interface BrokerExclusionSelectProps {
  brokers: string[]
  excludedBrokers: Set<string>
  onToggle: (name: string) => void
  onSelectAll: () => void
  onClearAll: () => void
}

export function BrokerExclusionSelect({ brokers, excludedBrokers, onToggle, onSelectAll, onClearAll }: BrokerExclusionSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (brokers.length === 0) return null

  return (
    <div className="border-t border-[var(--border)] pt-6">
      <label className="block text-sm font-medium text-[var(--text-primary)] mb-3">
        Broker Exclusions <span className="text-xs font-normal text-[var(--text-tertiary)]">(applies to this audit only)</span>
      </label>

      <div className="relative" ref={ref}>
        <button
          onClick={() => setIsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm hover:border-[var(--primary)] transition-colors duration-150"
        >
          <span className={excludedBrokers.size > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
            {excludedBrokers.size > 0
              ? `${excludedBrokers.size} broker${excludedBrokers.size > 1 ? 's' : ''} excluded`
              : 'No brokers excluded'}
          </span>
          <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
        </button>

        {isOpen && (
          <div className="absolute z-20 mt-1 w-full bg-white border border-[var(--border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-hidden">
            <div className="p-2 border-b border-[var(--border)]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="Search brokers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg)]">
              <button
                onClick={onSelectAll}
                className="text-[11px] font-medium text-[var(--primary)] hover:underline"
              >
                Select all
              </button>
              <button
                onClick={onClearAll}
                className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                Clear all
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto">
              {brokers
                .filter((b) => b.toLowerCase().includes(search.toLowerCase()))
                .map((broker) => {
                  const isExcluded = excludedBrokers.has(broker)
                  return (
                    <button
                      key={broker}
                      onClick={() => onToggle(broker)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150 ${
                        isExcluded ? 'bg-[var(--danger-subtle)] text-[var(--danger)]' : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <span className={`h-4 w-4 rounded-[var(--radius-sm)] border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                        isExcluded ? 'border-[var(--danger)] bg-[var(--danger)]' : 'border-[var(--border-strong)]'
                      }`}>
                        {isExcluded && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <span className="truncate">{broker}</span>
                    </button>
                  )
                })}
              {brokers.filter((b) => b.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                  No brokers match your search
                </div>
              )}
            </div>

            <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-tertiary)] text-center">
              {excludedBrokers.size} of {brokers.length} excluded
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
