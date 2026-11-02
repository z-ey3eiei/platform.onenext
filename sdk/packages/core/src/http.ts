import { ApiError, PlatformError } from './errors.ts'
import { joinUrl, resolveConfig, type ClientConfig, type ResolvedConfig } from './config.ts'
import { serializeQuery, type QueryInput } from './query-string.ts'
import {
  backoffDelayMs,
  isRetryableMethod,
  isRetryableStatus,
  retryDelayFromHeaders,
  sleep,
  type RetryPolicy,
} from './retry.ts'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

export interface RequestOptions {
  method?: HttpMethod | undefined
  query?: QueryInput | undefined
  body?: unknown
  headers?: Record<string, string> | undefined
  signal?: AbortSignal | undefined
  /** Sent as `Idempotency-Key`; also makes POST/PATCH safe to retry. */
  idempotencyKey?: string | undefined
  /** Overrides config.maxRetries for this call. */
  maxRetries?: number | undefined
  /** Retry POST/PATCH even without an idempotency key. Use with care. */
  retryUnsafe?: boolean | undefined
  accept?: string | undefined
}

/** The envelope every module returns: branch on `error`, never on exceptions. */
export interface ApiResult<T> {
  data: T | null
  error: PlatformError | null
}

export interface HttpClient {
  readonly config: ResolvedConfig
  request<T>(path: string, options?: RequestOptions): Promise<ApiResult<T>>
  /** Exposed so adapters (React/Next) can share one transport. */
  urlFor(path: string, query?: QueryInput): string
}

function requestIdFrom(headers: Headers): string | undefined {
  return headers.get('x-onenext-request-id') ?? headers.get('x-request-id') ?? undefined
}

/** Parse defensively: an HTML error page from a proxy must not become a JSON syntax error. */
async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (text.length === 0) return null
  const type = response.headers.get('content-type') ?? ''
  if (type.includes('json')) {
    try {
      return JSON.parse(text)
    } catch {
      return { raw: text.slice(0, 2000) }
    }
  }
  return { raw: text.slice(0, 2000) }
}

function messageFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>
    for (const key of ['message', 'error_description', 'error', 'detail']) {
      const value = record[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
  }
  return `Request failed with HTTP ${status}`
}

function codeFrom(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const code = (body as Record<string, unknown>).code
    if (typeof code === 'string') return code
  }
  return `http_${status}`
}

export function createHttpClient(input: ClientConfig): HttpClient {
  const config = resolveConfig(input)
  const doFetch: typeof fetch = config.fetch ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    throw new PlatformError({ code: 'invalid_config', message: 'fetch is not available; pass config.fetch explicitly' })
  }

  const policy: RetryPolicy = {
    maxRetries: config.maxRetries,
    baseDelayMs: config.retryBaseDelayMs,
    maxDelayMs: config.retryMaxDelayMs,
    random: Math.random,
    sleep,
  }

  function urlFor(path: string, query?: QueryInput): string {
    const base = joinUrl(config.baseUrl, path)
    const qs = query ? serializeQuery(query) : ''
    return qs.length > 0 ? `${base}?${qs}` : base
  }

  function baseHeaders(options: RequestOptions): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.apiKey}`,
      accept: options.accept ?? 'application/json',
      'user-agent': config.userAgent ?? 'platform-onenext-sdk/0.1.0',
      ...options.headers,
    }
    if (config.projectId) headers['x-onenext-project'] = config.projectId
    if (options.idempotencyKey) headers['idempotency-key'] = options.idempotencyKey
    if (options.body !== undefined) headers['content-type'] = 'application/json'
    return headers
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
    const method = (options.method ?? 'GET').toUpperCase() as HttpMethod
    const maxRetries = options.maxRetries ?? policy.maxRetries
    const url = urlFor(path, options.query)
    const headers = baseHeaders(options)
    const payload = options.body === undefined ? undefined : JSON.stringify(options.body)

    let lastError: PlatformError | null = null

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const startedAt = Date.now()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), config.timeoutMs)
      const onOuterAbort = () => controller.abort(new DOMException('Aborted', 'AbortError'))
      options.signal?.addEventListener('abort', onOuterAbort, { once: true })

      config.logger?.debug('platform.onenext request', { method, url, attempt })

      let response: Response
      try {
        const init: RequestInit = { method, headers, signal: controller.signal }
        if (payload !== undefined) init.body = payload
        response = await doFetch(url, init)
      } catch (cause) {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onOuterAbort)
        const aborted = options.signal?.aborted
        lastError = new PlatformError({
          code: aborted ? 'aborted' : controller.signal.aborted ? 'timeout' : 'network_error',
          message: aborted
            ? `Request to ${path} was cancelled by the caller`
            : controller.signal.aborted
              ? `Request to ${path} timed out after ${config.timeoutMs}ms`
              : `Network error calling ${method} ${path}`,
          cause,
          retryable: !aborted,
        })
        config.logger?.warn('platform.onenext transport failure', { url, attempt, code: lastError.code })
        if (aborted) return { data: null, error: lastError }
        if (attempt < maxRetries) {
          await policy.sleep(backoffDelayMs(attempt, policy), options.signal)
          continue
        }
        return { data: null, error: lastError }
      } finally {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onOuterAbort)
      }

      const requestId = requestIdFrom(response.headers)
      const body = await parseBody(response)
      const durationMs = Date.now() - startedAt

      if (response.ok) {
        config.logger?.debug('platform.onenext response', { url, status: response.status, durationMs, requestId })
        return { data: body as T, error: null }
      }

      const retryable = isRetryableStatus(response.status)
      lastError = new ApiError({
        code: codeFrom(body, response.status),
        message: messageFrom(body, response.status),
        status: response.status,
        requestId,
        details: body ?? undefined,
        retryable,
      })
      config.logger?.warn('platform.onenext http error', { url, status: response.status, requestId, attempt })

      const canRetryMethod = isRetryableMethod(method, Boolean(options.idempotencyKey) || options.retryUnsafe)
      if (retryable && canRetryMethod && attempt < maxRetries) {
        const wait = retryDelayFromHeaders(response.headers, backoffDelayMs(attempt, policy))
        await policy.sleep(wait, options.signal)
        continue
      }
      return { data: null, error: lastError }
    }

    return { data: null, error: lastError ?? new PlatformError({ code: 'http_error', message: 'Request failed' }) }
  }

  return { config, request, urlFor }
}
