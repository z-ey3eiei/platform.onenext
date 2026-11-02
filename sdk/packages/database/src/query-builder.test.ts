import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHttpClient } from '@platform-onenext/core'
import { startStubServer, type StubHandle } from '../../../testing/stub-server.ts'
import { createQueryBuilder } from './index.ts'
import type { Row } from './types.ts'

let stub: StubHandle
const http = () => createHttpClient({ apiKey: 'pk_test', baseUrl: stub.url, maxRetries: 0 })
const from = <T extends Row = Row>(table: string) => createQueryBuilder<T>(http(), table)

/** Parse the builder's URL so assertions test meaning, not percent-encoding. */
function paramsOf(url: string): URLSearchParams {
  return new URL(url).searchParams
}

beforeEach(async () => {
  stub = await startStubServer()
})
afterEach(async () => {
  await stub.close()
})

describe('toQuery — what would be sent', () => {
  it('matches the documented shape', () => {
    const url = new URL(from('users').select('*').limit(10).toQuery())
    expect(url.pathname).toBe('/rest/v1/users')
    expect(Object.fromEntries(url.searchParams)).toEqual({ select: '*', limit: '10' })
  })

  it('renders eq / cmp / in / like / is', () => {
    expect(paramsOf(from('t').eq('role', 'admin').toQuery()).get('role')).toBe('eq.admin')
    expect(paramsOf(from('t').gt('age', 18).toQuery()).get('age')).toBe('gt.18')
    expect(paramsOf(from('t').in('id', [1, 2, 3]).toQuery()).get('id')).toBe('in.(1,2,3)')
    expect(paramsOf(from('t').ilike('email', '%@example.com').toQuery()).get('email')).toBe('ilike.%@example.com')
    expect(paramsOf(from('t').isNull('deleted_at').toQuery()).get('deleted_at')).toBe('is.null')
  })

  it('strips spaces from a select list', () => {
    expect(paramsOf(from('t').select('id, email, role').toQuery()).get('select')).toBe('id,email,role')
  })

  it('orders and paginates', () => {
    const params = paramsOf(from('t').order('created_at', { order: 'desc' }).limit(5).offset(10).toQuery())
    expect(params.get('order')).toBe('created_at.desc')
    expect(params.get('limit')).toBe('5')
    expect(params.get('offset')).toBe('10')
  })

  it('round-trips a value containing reserved characters', () => {
    expect(paramsOf(from('t').eq('email', 'a&b=c').toQuery()).get('email')).toBe('eq.a&b=c')
  })

  it('converts a Date filter to ISO-8601', () => {
    const date = new Date('2026-01-02T03:04:05.000Z')
    expect(paramsOf(from('t').gte('created_at', date).toQuery()).get('created_at')).toBe(
      'gte.2026-01-02T03:04:05.000Z',
    )
  })
})

describe('input validation', () => {
  it('rejects a negative or fractional limit', () => {
    expect(() => from('t').limit(-1)).toThrowError(/non-negative integer/)
    expect(() => from('t').limit(1.5)).toThrowError(/non-negative integer/)
  })
  it('rejects a negative offset', () => {
    expect(() => from('t').offset(-1)).toThrowError(/non-negative integer/)
  })
})

describe('execute — against the stub backend', () => {
  it('is awaitable directly, as the docs promise', async () => {
    const { data, error } = await from('users').select('*').limit(10)
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
  })

  it('filters server-side', async () => {
    const { data } = await from('users').select('*').eq('role', 'member')
    const rows = data as { id: number; email: string; role: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.role === 'member')).toBe(true)
  })

  it('combines filters and limit', async () => {
    const { data } = await from('users').select('id').eq('role', 'member').limit(1)
    expect(data).toHaveLength(1)
  })

  it('returns one object for single()', async () => {
    const { data, error } = await from('users').select('*').eq('id', 1).single()
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(false)
    expect((data as { email: string }).email).toBe('a@example.com')
  })

  it('surfaces the backend error when single() matches nothing', async () => {
    const { data, error } = await from('users').select('*').eq('id', 999).single()
    expect(data).toBeNull()
    expect(error?.code).toBe('pgrst_not_unique')
  })

  it('reports builder misuse as an error instead of throwing', async () => {
    const { error } = await from('users').in('id', [])
    expect(error?.code).toBe('invalid_query')
    expect(error?.message).toMatch(/at least one value/)
  })

  it('rejects two filters on the same column rather than silently dropping one', async () => {
    const { error } = await from('users').gt('id', 1).lt('id', 3)
    expect(error?.code).toBe('invalid_query')
    expect(error?.message).toMatch(/Duplicate filter/)
  })

  it('reports an empty table name', async () => {
    const { error } = await from('   ')
    expect(error?.code).toBe('invalid_query')
  })

  it('passes through a backend failure untouched', async () => {
    const builder = createQueryBuilder(http(), 'does-not-exist')
    const { error } = await builder
    expect(error?.status).toBe(404)
  })

  it('honours a custom basePath', () => {
    const builder = createQueryBuilder(http(), 'users', { basePath: '/v2/db' })
    expect(builder.toQuery()).toContain('/v2/db/users')
  })
})
