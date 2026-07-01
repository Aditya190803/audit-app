import React from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

/** Props mirror the useApCodeSelection hook return, plus detectedColumns. */
export interface ApCodeSelectProps {
  apCodeEnabled: boolean
  setApCodeEnabled: React.Dispatch<React.SetStateAction<boolean>>
  apCodeColumn: string
  setApCodeColumn: React.Dispatch<React.SetStateAction<string>>
  availableApCodes: string[]
  selectedApCodes: Set<string>
  setSelectedApCodes: React.Dispatch<React.SetStateAction<Set<string>>>
  apCodeDropdownOpen: boolean
  setApCodeDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>
  apCodeSearch: string
  setApCodeSearch: React.Dispatch<React.SetStateAction<string>>
  apCodeLoading: boolean
  apCodeDropdownRef: React.RefObject<HTMLDivElement | null>
  detectedColumns: string[]
}

export const ApCodeSelect: React.FC<ApCodeSelectProps> = ({
  apCodeEnabled,
  setApCodeEnabled,
  apCodeColumn,
  setApCodeColumn,
  availableApCodes,
  selectedApCodes,
  setSelectedApCodes,
  apCodeDropdownOpen,
  setApCodeDropdownOpen,
  apCodeSearch,
  setApCodeSearch,
  apCodeLoading,
  apCodeDropdownRef,
  detectedColumns,
}) => {
  return (
    <div className="border-t border-[var(--border)] pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          AP Code Available
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={apCodeEnabled}
          onClick={() => {
            setApCodeEnabled((v) => !v)
            if (apCodeEnabled) {
              setSelectedApCodes(new Set())
            }
          }}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 ${
            apCodeEnabled ? 'bg-[var(--primary)]' : 'bg-[var(--border-strong)]'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ${
            apCodeEnabled ? 'translate-x-4' : 'translate-x-0'
          }`} />
        </button>
      </div>

      {apCodeEnabled && apCodeColumn && (
        <div>
          <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
            AP Code Column
          </label>
          <select
            value={apCodeColumn}
            onChange={(e) => setApCodeColumn(e.target.value)}
            className="input-field"
          >
            {detectedColumns.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </div>
      )}

      {apCodeEnabled && (
        <div className="relative" ref={apCodeDropdownRef}>
          <label className="block text-xs font-medium text-[var(--text-tertiary)] mb-1.5 uppercase tracking-wider">
            AP Codes <span className="text-xs font-normal normal-case text-[var(--text-tertiary)]">(select to include related clients)</span>
          </label>
          <button
            onClick={() => {
              if (availableApCodes.length > 0) setApCodeDropdownOpen((o) => !o)
            }}
            disabled={apCodeLoading}
            className={`w-full flex items-center justify-between px-3 py-2 bg-white border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm transition-colors duration-150 ${
              availableApCodes.length > 0 ? 'hover:border-[var(--primary)]' : 'opacity-60 cursor-not-allowed'
            }`}
          >
            <span className={selectedApCodes.size > 0 ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)]'}>
              {apCodeLoading
                ? 'Loading...'
                : availableApCodes.length === 0
                  ? apCodeColumn ? 'No AP codes found' : 'No AP code column detected'
                  : selectedApCodes.size > 0
                    ? `${selectedApCodes.size} AP code${selectedApCodes.size > 1 ? 's' : ''} selected`
                    : `${availableApCodes.length} AP code${availableApCodes.length > 1 ? 's' : ''} available`}
            </span>
            {!apCodeLoading && availableApCodes.length > 0 && (
              <ChevronDown className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform duration-150 ${apCodeDropdownOpen ? 'rotate-180' : ''}`} strokeWidth={2} />
            )}
          </button>

          {apCodeDropdownOpen && availableApCodes.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-[var(--border-strong)] rounded-[var(--radius-lg)] shadow-[var(--shadow-md)] overflow-hidden">
              <div className="p-2 border-b border-[var(--border)]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                  <input
                    type="text"
                    placeholder="Search AP codes..."
                    value={apCodeSearch}
                    onChange={(e) => setApCodeSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)]"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg)]">
                <button
                  onClick={() => setSelectedApCodes(new Set(availableApCodes))}
                  className="text-[11px] font-medium text-[var(--primary)] hover:underline"
                >
                  Select all
                </button>
                <button
                  onClick={() => setSelectedApCodes(new Set())}
                  className="text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  Clear all
                </button>
              </div>

              <div className="max-h-56 overflow-y-auto">
                {availableApCodes
                  .filter((code) => code.toLowerCase().includes(apCodeSearch.toLowerCase()))
                  .map((code) => {
                    const isSelected = selectedApCodes.has(code)
                    return (
                      <button
                        key={code}
                        onClick={() => {
                          setSelectedApCodes((prev) => {
                            const next = new Set(prev)
                            if (next.has(code)) next.delete(code)
                            else next.add(code)
                            return next
                          })
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors duration-150 ${
                          isSelected ? 'bg-[var(--primary-subtle)] text-[var(--primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        <span className={`h-4 w-4 rounded-[var(--radius-sm)] border flex items-center justify-center shrink-0 transition-colors duration-150 ${
                          isSelected ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border-strong)]'
                        }`}>
                          {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                        <span className="truncate">{code}</span>
                      </button>
                    )
                  })}
                {availableApCodes.filter((code) => code.toLowerCase().includes(apCodeSearch.toLowerCase())).length === 0 && (
                  <div className="px-3 py-4 text-sm text-[var(--text-tertiary)] text-center">
                    No AP codes match your search
                  </div>
                )}
              </div>

              <div className="px-3 py-1.5 border-t border-[var(--border)] bg-[var(--bg)] text-[11px] text-[var(--text-tertiary)] text-center">
                {selectedApCodes.size} of {availableApCodes.length} selected · Clients without AP code always included
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
