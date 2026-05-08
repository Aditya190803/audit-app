import React from 'react'
import type { Tag } from '../types/api'

interface TagBadgeProps {
  tag: Tag
  onRemove?: (tagId: number) => void
  showConfidence?: boolean
}

const tagClasses: Record<string, string> = {
  client: 'tag-client',
  broker: 'tag-broker',
  suspicious: 'tag-suspicious'
}

function extractMatchedName(reason: string | null): string | null {
  if (!reason) return null
  const match = reason.match(/'([^']+)'/)
  return match ? match[1] : null
}

export const TagBadge: React.FC<TagBadgeProps> = ({ tag, onRemove, showConfidence = true }) => {
  const cls = tagClasses[tag.tag_type] || tagClasses.client
  const matchedName = extractMatchedName(tag.reason)

  return (
    <span className={cls}>
      {matchedName ? (
        <span>{matchedName}</span>
      ) : (
        <span className="capitalize">{tag.tag_type}</span>
      )}
      {showConfidence && tag.confidence < 1.0 && (
        <span className="ml-1 opacity-70">
          {Math.round(tag.confidence * 100)}%
        </span>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(tag.id)
          }}
          className="ml-1 opacity-50 hover:opacity-100 transition-opacity duration-150"
        >
          ×
        </button>
      )}
    </span>
  )
}

export const TagBadgeList: React.FC<{
  tags: Tag[]
  onRemoveTag?: (tagId: number) => void
}> = ({ tags, onRemoveTag }) => {
  if (!tags || tags.length === 0) return (
    <span className="text-xs text-[var(--text-tertiary)] italic">Untagged</span>
  )
  // Single tag only: show only the first (most recent/relevant) tag
  const tag = tags[0]
  return (
    <TagBadge tag={tag} onRemove={onRemoveTag} />
  )
}
