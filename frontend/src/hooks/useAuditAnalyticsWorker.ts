import { useState, useEffect, useRef, useMemo } from 'react'
import type { Transaction } from '../types/api'
import type { AdvancedFilters, AuditAnalytics } from '../utils/auditAnalytics'

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function useAuditAnalyticsWorker(
  transactions: Transaction[],
  searchQuery: string,
  effectiveFilterTags: string[],
  advancedFilters: AdvancedFilters,
  suspiciousThreshold: number,
  fallbackData?: AuditAnalytics
) {
  const [data, setData] = useState<AuditAnalytics | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  
  const workerRef = useRef<Worker | null>(null)
  const nextIdRef = useRef(1)

  const debouncedSearchQuery = useDebounce(searchQuery, 200)

  const workerDeps = useMemo(
    () => [transactions, debouncedSearchQuery, effectiveFilterTags, advancedFilters, suspiciousThreshold],
    [transactions, debouncedSearchQuery, effectiveFilterTags, advancedFilters, suspiciousThreshold]
  )

  useEffect(() => {
    // Initialize worker once
    workerRef.current = new Worker(new URL('../workers/auditAnalytics.worker.ts', import.meta.url), {
      type: 'module'
    })
    
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  useEffect(() => {
    if (!workerRef.current) return
    if (transactions.length === 0 && fallbackData) {
      setData(fallbackData)
      return
    }

    setIsComputing(true)
    const currentId = nextIdRef.current++
    
    const handleMessage = (e: MessageEvent) => {
      if (e.data.id === currentId) {
        if (e.data.error) {
          console.error("Worker error:", e.data.error)
        } else {
          setData(e.data.result)
        }
        setIsComputing(false)
      }
    }
    
    workerRef.current.onmessage = handleMessage
    
    workerRef.current.postMessage({
      id: currentId,
      transactions,
      searchQuery,
      effectiveFilterTags,
      advancedFilters,
      suspiciousThreshold
    })
    
  }, workerDeps)

  return { data, isComputing }
}
