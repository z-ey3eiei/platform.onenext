import type { ApiResult, HttpClient } from '@platform-onenext/core'
import { PlatformError } from '@platform-onenext/core'
import { renderFilters, renderOrder } from './filters.ts'
import type { DatabaseConfig, Order, QueryState, Row } from './types.ts'

const SINGLE_ACCEPT = 'application/vnd.pgrst.object+json'

/**
 * Chainable, lazy query builder. Nothing is sent until `then()`/`execute()` so
 * a builder can be assembled, inspected (`toQuery()`), then run.
 *
 * `.then()` makes `await builder` work, which is what the platform.onenext
 * docs promise: `await client.database.from('users').select('*').limit(10)`.
 */
export class QueryBuilder<TResult = Row> implements PromiseLike<ApiResult<TResult | TResult[]>> {
  private readonly state: QueryState
  private readonly http: HttpClient
  private readonly table: string
  private readonly basePath: string

  constructor(http: HttpClient, table: string, basePath: string) {
    this.http = http
    this.table = table
    this.basePath = basePath
    this.state = { columns: '*', filters: [], shape: 'array' }
  }

  private push(mutate: (state: QueryState) => void): this {
    mutate(this.state)
    return this
  }

  select(columns = '*'): this {
    return this.push((state) => {
      state.columns = columns.replace(/\s+/g, '')
    })
  }

  eq(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'eq', column, value }))
  }

  neq(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'neq', column, value }))
  }

  gt(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'cmp', column, op: 'gt', value }))
  }

  gte(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'cmp', column, op: 'gte', value }))
  }

  lt(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'cmp', column, op: 'lt', value }))
  }

  lte(column: string, value: unknown): this {
    return this.push((state) => state.filters.push({ kind: 'cmp', column, op: 'lte', value }))
  }

  like(column: string, pattern: string): this {
    return this.push((state) => state.filters.push({ kind: 'like', column, op: 'like', value: pattern }))
  }

  ilike(column: string, pattern: string): this {
    return this.push((state) => state.filters.push({ kind: 'like', column, op: 'ilike', value: pattern }))
  }

  isNull(column: string): this {
    return this.push((state) => state.filters.push({ kind: 'is', column, value: null }))
  }

  in(column: string, values: readonly unknown[]): this {
    return this.push((state) => state.filters.push({ kind: 'in', column, values }))
  }

  order(column: string, { order = 'asc' }: { order?: Order } = {}): this {
    return this.push((state) => {
      state.order = { column, order }
    })
  }

  limit(count: number): this {
    if (!Number.isInteger(count) || count < 0) {
      throw new TypeError(`limit() expects a non-negative integer, got ${count}`)
    }
    return this.push((state) => {
      state.limit = count
    })
  }

  offset(start: number): this {
    if (!Number.isInteger(start) || start < 0) {
      throw new TypeError(`offset() expects a non-negative integer, got ${start}`)
    }
    return this.push((state) => {
      state.offset = start
    })
  }

  /** Expect exactly one row. A backend returning 0 or 2+ rows becomes an error. */
  single(): this {
    return this.push((state) => {
      state.shape = 'single'
    })
  }

  /** The URL this builder would call — handy in tests and when debugging. */
  toQuery(): string {
    const query: Record<string, string> = { select: this.state.columns }
    Object.assign(query, renderFilters(this.state.filters))
    if (this.state.order) query.order = renderOrder(this.state.order.column, this.state.order.order)
    if (this.state.limit !== undefined) query.limit = String(this.state.limit)
    if (this.state.offset !== undefined) query.offset = String(this.state.offset)
    return this.http.urlFor(`${this.basePath}/${this.table}`, query)
  }

  execute(): Promise<ApiResult<TResult | TResult[]>> {
    if (this.table.trim().length === 0) {
      return Promise.resolve({
        data: null,
        error: new PlatformError({ code: 'invalid_query', message: 'from() needs a table name' }),
      })
    }

    let query: Record<string, string>
    try {
      query = { select: this.state.columns }
      Object.assign(query, renderFilters(this.state.filters))
      if (this.state.order) query.order = renderOrder(this.state.order.column, this.state.order.order)
      if (this.state.limit !== undefined) query.limit = String(this.state.limit)
      if (this.state.offset !== undefined) query.offset = String(this.state.offset)
    } catch (cause) {
      return Promise.resolve({
        data: null,
        error: new PlatformError({ code: 'invalid_query', message: (cause as Error).message, cause }),
      })
    }

    return this.http
      .request<TResult | TResult[]>(`${this.basePath}/${this.table}`, {
        method: 'GET',
        query,
        accept: this.state.shape === 'single' ? SINGLE_ACCEPT : undefined,
      })
      .then((result) => {
        // A single() call must never hand back an array, even on a lenient backend.
        if (this.state.shape === 'single' && Array.isArray(result.data)) {
          return {
            data: null,
            error: new PlatformError({
              code: 'invalid_response',
              message: `Expected one row from "${this.table}" but the backend returned ${result.data.length}`,
            }),
          }
        }
        return result
      })
  }

  then<TResult1 = ApiResult<TResult | TResult[]>, TResult2 = never>(
    onfulfilled?: ((value: ApiResult<TResult | TResult[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

export function createQueryBuilder<TRow extends Row>(
  http: HttpClient,
  table: string,
  config: DatabaseConfig = {},
): QueryBuilder<TRow> {
  return new QueryBuilder<TRow>(http, table, config.basePath ?? '/rest/v1')
}
