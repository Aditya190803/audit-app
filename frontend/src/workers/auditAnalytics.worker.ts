import { buildAuditAnalytics } from '../utils/auditAnalytics'

self.onmessage = (e) => {
  const { id, transactions, searchQuery, effectiveFilterTags, advancedFilters, suspiciousThreshold } = e.data
  
  try {
    const result = buildAuditAnalytics(
      transactions,
      searchQuery,
      effectiveFilterTags,
      advancedFilters,
      suspiciousThreshold
    )
    
    self.postMessage({ id, result })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
