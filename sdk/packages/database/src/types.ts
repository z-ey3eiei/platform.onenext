/** Row shapes come from the user's schema; nothing here hardcodes a table. */
export type Row = Record<string, unknown>
export type Schema = Record<string, Row>

export type Operator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'like' | 'ilike' | 'is'
  | 'in' | 'is'
  | (string & {})

export type Order = 'asc' | 'desc'

export type Filter =
  | { kind: 'eq'; column: string; value: unknown }
  | { kind: 'neq'; column: string; value: unknown }
  | { kind: 'cmp'; column: string; op: 'gt' | 'gte' | 'lt' | 'lte'; value: unknown }
  | { kind: 'like'; column: string; op: 'like' | 'ilike'; value: string }
  | { kind: 'is'; column: string; value: null | true | false }
  | { kind: 'in'; column: string; values: readonly unknown[] }

export interface QueryState {
  columns: string
  filters: Filter[]
  order?: { column: string; order: Order }
  limit?: number
  offset?: number
  /** 'single' asks the backend for exactly one object instead of an array. */
  shape: 'array' | 'single'
}

export interface DatabaseConfig {
  /** PostgREST-style base path. Default: /rest/v1 */
  basePath?: string
}
