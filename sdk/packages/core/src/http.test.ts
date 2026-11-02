import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startStubServer, type StubHandle } from '../../../testing/stub-server.ts'
import { ApiError, PlatformError } from './errors.ts'
import { createHttpClient } from './http.ts'
import type { ClientConfig } from './config.ts'

let stub: StubHandle

beforeEach(async () => {
  stub = await startStubServer()
})
afterEach(async () => {
  await stub.close()
})

function client(overrides: Partial<ClientConfig> = {}) {
  return createHttpClient({ apiKey: 'pk_test', baseUrl: stub.url, maxRetries: 0, ...overrides })
}

describe('createHttpClient — happy path', () => {
  it('returns parsed JSON in data with error null', async () => {
    const { data, error } = await client().request<unknown[]>('/rest/v1/users')
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
  })

  it('sends the API key as a bearer token', async () => {
    await client().request('/rest/v1/users')
    expect(stub.requests[0]?.headers.authorization).toBe('Bearer pk_test')
  })

  it('adds project, user-agent and accept headers', async () => {
    await client({ projectId: 'prj_123' }).request('/rest/v1/users')
    expect(stub.requests[0]?.headers['x-onenext-project']).toBe('prj_123')
    expect(stub.requests[0]?.headers['user-agent']).toMatch(/platform-onenext-sdk/)
  })

  it('serialises query values, skipping undefined', async () => {
    const c = client()
    await c.request('/rest/v1/users', { query: { select: '*', limit: 2, skip: undefined, flag: true } })
    const path = stub.requests[0]?.path ?? ''
    const [pathname, search = ''] = path.split('?')
    const params = new URLSearchParams(search)
    expect(pathname).toBe('/rest/v1/users')
    expect(params.get('select')).toBe('*')
    expect(params.get('limit')).toBe('2')
    expect(params.get('flag')).toBe('true')
    expect(params.has('skip')).toBe(false)
  })

  it('builds URLs without calling fetch', () => {
    const url = client().urlFor('/rest/v1/users', { limit: 5 })
    expect(url).toBe(`${stub.url}/rest/v1/users?limit=5`)
  })
})

describe('createHttpClient — errors are returned, not thrown', () => {
  it('maps a 404 to an ApiError with code and message', async () => {
    const { data, error } = await client().request('/missing')
    expect(data).toBeNull()
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect(error?.code).toBe('not_found')
    expect(error?.message).toBe('no such resource')
  })

  it('attaches the backend request id for support tickets', async () => {
    const { error } = await client().request('/boom')
    expect(error?.requestId).toMatch(/^stub-/)
  })

  it('marks 5xx retryable and 4xx not retryable', async () => {
    expect((await client().request('/boom')).error?.retryable).toBe(true)
    expect((await client().request('/missing')).error?.retryable).toBe(false)
  })

  it('survives a non-JSON body from a proxy', async () => {
    const html = new Response('<html>502 bad gateway</html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    const c = createHttpClient({ apiKey: 'k', baseUrl: 'https://x.test', maxRetries: 0, fetch: async () => html })
    const { error } = await c.request('/anything')
    expect((error?.details as { raw: string }).raw).toContain('bad gateway')
  })

  it('handles an empty 204 body as null data', async () => {
    const empty = new Response(null, { status: 204 })
    const c = createHttpClient({ apiKey: 'k', baseUrl: 'https://x.test', maxRetries: 0, fetch: async () => empty })
    expect(await c.request('/delete-me')).toEqual({ data: null, error: null })
  })
})

describe('createHttpClient — retries', () => {
  it('retries 429 and succeeds, using Retry-After', async () => {
    stub.reset()
    const { data, error } = await client({ maxRetries: 4, retryBaseDelayMs: 1 }).request('/flaky')
    expect(error).toBeNull()
    expect((data as { ok: boolean }).ok).toBe(true)
    expect(stub.requests.filter((r) => r.path === '/flaky')).toHaveLength(3)
  })

  it('gives up after maxRetries and reports the last error', async () => {
    stub.reset()
    const { error } = await client({ maxRetries: 1, retryBaseDelayMs: 1 }).request('/flaky')
    expect(error?.code).toBe('rate_limited')
    expect(stub.requests.filter((r) => r.path === '/flaky')).toHaveLength(2)
  })

  it('does not retry POST without an idempotency key', async () => {
    stub.reset()
    await client({ maxRetries: 3, retryBaseDelayMs: 1 }).request('/flaky', { method: 'POST', body: {} })
    expect(stub.requests.filter((r) => r.path === '/flaky')).toHaveLength(1)
  })

  it('retries POST when an idempotency key is supplied', async () => {
    stub.reset()
    await client({ maxRetries: 4, retryBaseDelayMs: 1 }).request('/flaky', {
      method: 'POST',
      body: {},
      idempotencyKey: 'abc',
    })
    expect(stub.requests.filter((r) => r.path === '/flaky')).toHaveLength(3)
    expect(stub.requests[0]?.headers['idempotency-key']).toBe('abc')
  })
})

describe('createHttpClient — timeouts and cancellation', () => {
  it('aborts a never-answering request at timeoutMs', async () => {
    const { error } = await client({ timeoutMs: 40 }).request('/slow')
    expect(error?.code).toBe('timeout')
    expect(error?.retryable).toBe(true)
  })

  it('reports caller cancellation as aborted, not timeout', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 10)
    const { error } = await client({ timeoutMs: 5_000 }).request('/slow', { signal: controller.signal })
    expect(error?.code).toBe('aborted')
    expect(error?.retryable).toBe(false)
  })

  it('classifies a dropped connection as network_error', async () => {
    const c = createHttpClient({
      apiKey: 'k',
      baseUrl: 'https://x.test',
      maxRetries: 0,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const { error } = await c.request('/anything')
    expect(error?.code).toBe('network_error')
  })
})

describe('createHttpClient — observability', () => {
  it('logs requests and failures without leaking the api key', async () => {
    const logger = { debug: vi.fn(), warn: vi.fn() }
    await createHttpClient({ apiKey: 'super-secret', baseUrl: stub.url, maxRetries: 0, logger }).request(
      '/rest/v1/users',
    )
    const lines = [...logger.debug.mock.calls, ...logger.warn.mock.calls].map((call) =>
      JSON.stringify(call),
    )
    expect(lines.join(' ')).toContain('/rest/v1/users')
    expect(lines.join(' ')).not.toContain('super-secret')
  })

  it('refuses to build without fetch', () => {
    const original = globalThis.fetch
    // @ts-expect-error deliberately removing fetch for this assertion
    globalThis.fetch = undefined
    try {
      expect(() => createHttpClient({ apiKey: 'k', baseUrl: 'https://x.test' })).toThrowError(/fetch is not available/)
    } finally {
      globalThis.fetch = original
    }
  })

  it('PlatformError.toJSON omits details so it is safe to send to a logger', async () => {
    const { error } = await client().request('/missing')
    const json = error?.toJSON()
    expect(json).toMatchObject({ code: 'not_found', status: 404 })
    expect(json).not.toHaveProperty('details')
  })

  it('isPlatformError recognises thrown errors across module realms', () => {
    const structural = { name: 'PlatformError', code: 'timeout', message: 'x', retryable: true }
    expect(errorIsPlatform(structural)).toBe(true)
    expect(errorIsPlatform(new Error('plain'))).toBe(false)
    expect(errorIsPlatform(null)).toBe(false)
  })
})

function errorIsPlatform(value: unknown): boolean {
  return value instanceof PlatformError ||
    (typeof value === 'object' && value !== null && (value as { name?: string }).name === 'PlatformError')
}
