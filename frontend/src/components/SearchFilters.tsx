import React from 'react'
import { Search, X } from 'lucide-react'

interface SearchFiltersProps {
  searchQuery: string
  filterTags: string[]
  onSearchChange: (q: string) => void
  onFilterTagsChange: (tags: string[]) => void
}

export const SearchFilters: React.FC<SearchFiltersProps> = ({
  searchQuery,
  filterTags,
  onSearchChange,
  onFilterTagsChange
}) => {
  const hasFilters = searchQuery || filterTags.length > 0

  const clearFilters = () => {
    onSearchChange('')
    onFilterTagsChange([])
  }

  return (
    <div className="px-3 py-2.5 border-b border-[var(--border)] flex items-center gap-3 bg-[var(--surface)]">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search transactions..."
          className="w-full pl-8 pr-3 py-1.5 bg-[var(--bg)] border border-[var(--border-strong)] rounded-[var(--radius-md)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent placeholder:text-[var(--text-tertiary)] transition-shadow duration-150"
        />
      </div>

      <div className="flex-1" />

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="btn-ghost text-xs"
        >
          <X className="h-3 w-3" strokeWidth={2} />
          Clear
        </button>
      )}
    </div>
  )
}
