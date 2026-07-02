/** Headers that may hold per-client codes in intake CSV/Excel. */
export const CLIENT_CODE_KEYWORDS = [
  'client code',
  'client_code',
  'client id',
  'client_id',
  'clientcode',
  'clientid',
]

export function bestClientCodeColumnMatch(headers: string[]): string | null {
  const normalized = headers.map((h) => h.trim().toLowerCase().replace(/[_\s]+/g, '_'))
  for (const candidate of CLIENT_CODE_KEYWORDS) {
    const candNorm = candidate.toLowerCase().replace(/[_\s]+/g, '_')
    const exact = normalized.findIndex((h) => h === candNorm)
    if (exact !== -1) return headers[exact]
    const includes = normalized.findIndex((h) => h.includes(candNorm))
    if (includes !== -1) return headers[includes]
  }
  return null
}