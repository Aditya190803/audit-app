import { useCallback, useRef, useState } from 'react'
import { preParsePdf } from '../lib/api'

export type PreParseStatus = 'parsing' | 'ready' | 'password_required' | 'error'

export interface PreParseFileState {
  status: PreParseStatus
  fileHash?: string
  pageCount?: number
  error?: string
}

// Cap concurrent pre-parse requests so dropping many PDFs doesn't saturate the
// backend process pool (2 workers) or make the machine unresponsive.
const MAX_CONCURRENT = 2

type QueuedFile = { file: File; password?: string; bankName?: string }

/**
 * Pre-parses dropped PDFs in the background so Start is instant.
 * Tracks per-file status and a map of {filename -> fileHash} for ready files.
 */
export function usePreParse() {
  const [states, setStates] = useState<Record<string, PreParseFileState>>({})
  const queueRef = useRef<QueuedFile[]>([])
  const activeRef = useRef(0)

  const setFileState = useCallback((filename: string, patch: PreParseFileState) => {
    setStates((prev) => ({ ...prev, [filename]: { ...prev[filename], ...patch } }))
  }, [])

  const runNext = useCallback(() => {
    while (activeRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      const item = queueRef.current.shift()!
      activeRef.current += 1
      const { file, password, bankName } = item
      setFileState(file.name, { status: 'parsing' })
      void (async () => {
        try {
          const result = await preParsePdf(file, password, bankName)
          setFileState(file.name, {
            status: 'ready',
            fileHash: result.file_hash,
            pageCount: result.page_count,
            error: undefined,
          })
        } catch (e: unknown) {
          const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
          const isPassword = /password-protected/i.test(detail || '')
          setFileState(file.name, {
            status: isPassword ? 'password_required' : 'error',
            error: detail || (e as Error).message,
          })
        } finally {
          activeRef.current -= 1
          runNext()
        }
      })()
    }
  }, [setFileState])

  /** Queue files for pre-parsing (additive — does not cancel in-flight work). */
  const preParse = useCallback((files: File[], password?: string, bankName?: string) => {
    queueRef.current.push(...files.map((file) => ({ file, password, bankName })))
    runNext()
  }, [runNext])

  /** Re-pre-parse a single file after a password change. */
  const rePreParse = useCallback((file: File, password?: string, bankName?: string) => {
    queueRef.current.push({ file, password, bankName })
    runNext()
  }, [runNext])

  /** Map of {filename -> fileHash} for files that finished pre-parsing. Pass to parseFiles. */
  const readyHashes = useCallback((): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const [filename, st] of Object.entries(states)) {
      if (st.status === 'ready' && st.fileHash) out[filename] = st.fileHash
    }
    return out
  }, [states])

  return { states, preParse, rePreParse, readyHashes }
}
