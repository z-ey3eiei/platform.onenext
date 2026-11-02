/** Retry policy kept separate from the transport so it is trivially testable. */

export interface RetryPolicy {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  /** Injectable for deterministic tests. */
  random: () => number
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
}

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 522, 524])

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status)
}

/**
 * GET/HEAD/OPTIONS/PUT/DELETE are idempotent by definition. POST/PATCH are only
 * retried when the caller passes an idempotency key or opts in explicitly.
 */
export function isRetryableMethod(method: string, hasIdempotencyKey = false): boolean {
  const upper = method.toUpperCase()
  if (hasIdempotencyKey) return true
  return upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS' || upper === 'PUT' || upper === 'DELETE'
}

/** Full jitter (AWS "full jitter"): spreads retries so fleets do not synchronise. */
export function backoffDelayMs(attempt: number, policy: Pick<RetryPolicy, 'baseDelayMs' | 'maxDelayMs' | 'random'>): number {
  const capped = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** attempt)
  return Math.round(policy.random() * capped)
}

/** Honour the server's Retry-After (seconds or HTTP date) when present. */
export function retryDelayFromHeaders(headers: Headers, fallbackMs: number): number {
  const raw = headers.get('retry-after')
  if (!raw) return fallbackMs
  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000))
  const asDate = Date.parse(raw)
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now())
  return fallbackMs
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
