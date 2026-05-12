import React from 'react'
import type { Tag } from '../types/api'

interface TagBadgeProps {
  tag: Tag
  onRemove?: (tagId: number) => void
  onCycle?: (tag: Tag) => void
  showConfidence?: boolean
}

const tagClasses: Record<string, string> = {
  client: 'tag-client',
  broker: 'tag-broker',
  suspicious: 'tag-suspicious'
}

function extractMatchedName(reason: string | null): string | null {
  if (!reason) return null
  // Fuzzy match: 'John Doe' (score: ...)
  let match = reason.match(/'([^']+)'/)
  if (match) return match[1]
  // Phone match: 9876543210 -> John Doe
  match = reason.match(/->\s*(.+)$/)
  if (match) return match[1].trim()
  return null
}

function formatPhoneMatch(reason: string | null): string | null {
  if (!reason) return null
  // Phone match: 9876543210 -> John Doe
  const match = reason.match(/Phone match:\s*(\d+)\s*->\s*(.+)/)
  if (match) return `phone: ${match[1]}`
  return null
}

function formatSuspiciousReason(reason: string | null): string {
  if (!reason) return 'suspicious'
  const segments = reason.split(';').map(s => s.trim()).filter(Boolean)
  const parts: string[] = []
  for (const seg of segments) {
    const lower = seg.toLowerCase()
    if (lower.startsWith('amount') && lower.includes('exceeds threshold')) {
      const match = seg.match(/Amount\s+([\d.]+)/i)
      const amount = match ? `₹${parseFloat(match[1]).toLocaleString('en-IN')}` : ''
      parts.push(`${amount} exceeds threshold`)
    } else if (lower.startsWith('contains suspicious keyword')) {
      const kwMatch = seg.match(/'([^']+)'/)
      parts.push(`keyword: ${kwMatch ? kwMatch[1] : '?'}`)
    } else if (lower.includes('recurring')) {
      parts.push('recurring transaction')
    } else {
      parts.push(seg)
    }
  }
  return parts.join(' | ')
}

function confidenceText(tag: Tag): string {
  return `${Math.round(tag.confidence * 100)}%`
}

export function formatTagReason(tag: Tag): string {
  const matchedName = extractMatchedName(tag.reason)
  const phoneText = formatPhoneMatch(tag.reason)

  if (tag.tag_type === 'client') {
    if (phoneText && matchedName) return `matched with client phone ${phoneText.replace('phone: ', '')} (${matchedName})`
    if (matchedName) return `matched with ${matchedName} (${confidenceText(tag)})`
    return tag.reason || 'matched with client'
  }

  if (tag.tag_type === 'broker') {
    if (matchedName) return `matched with ${matchedName} (${confidenceText(tag)})`
    return tag.reason || 'matched with broker'
  }

  if (tag.tag_type === 'suspicious') {
    return formatSuspiciousReason(tag.reason)
  }

  return tag.reason || tag.tag_type
}

export const TagBadge: React.FC<TagBadgeProps> = React.memo(({ tag, onRemove, onCycle, showConfidence = true }) => {
  const cls = tagClasses[tag.tag_type] || tagClasses.client

  return (
    <span
      className={`${cls} ${onCycle ? 'cursor-pointer' : ''}`}
      title={tag.reason || tag.tag_type}
      onClick={(e) => {
        if (onCycle) {
          e.stopPropagation()
          onCycle(tag)
        }
      }}
    >
      <span className="capitalize">{tag.tag_type}</span>
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
})

export const TagBadgeList: React.FC<{
  tags: Tag[]
  onRemoveTag?: (tagId: number) => void
  onCycleTag?: (tag: Tag) => void
}> = React.memo(({ tags, onRemoveTag, onCycleTag }) => {
  if (!tags || tags.length === 0) return (
    <span className="text-xs text-[var(--text-tertiary)] italic">Untagged</span>
  )
  const tag = tags[0]
  return (
    <TagBadge tag={tag} onRemove={onRemoveTag} onCycle={onCycleTag} showConfidence={false} />
  )
})
