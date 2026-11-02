import type { Filter, Order } from './types.ts'

function literal(value: unknown): string {
  if (value === null) return 'null'
  if (value === true) return 'true'
  if (value === false) return 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`Cannot filter on non-finite number: ${value}`)
    return String(value)
  }
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function renderFilter(filter: Filter): [column: string, value: string] {
  switch (filter.kind) {
    case 'eq':
      return [filter.column, `eq.${literal(filter.value)}`]
    case 'neq':
      return [filter.column, `neq.${literal(filter.value)}`]
    case 'cmp':
      return [filter.column, `${filter.op}.${literal(filter.value)}`]
    case 'like':
      return [filter.column, `${filter.op}.${filter.value}`]
    case 'is':
      return [filter.column, `is.${literal(filter.value)}`]
    case 'in': {
      if (filter.values.length === 0) {
        throw new TypeError(`.in("${filter.column}", []) needs at least one value; an empty set matches nothing`)
      }
      return [filter.column, `in.(${filter.values.map(literal).join(',')})`]
    }
  }
}

export function renderFilters(filters: readonly Filter[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const filter of filters) {
    const [column, value] = renderFilter(filter)
    // Two filters on the same column must both survive serialisation.
    if (column in out) {
      throw new TypeError(`Duplicate filter on column "${column}". Use .in() or a raw filter instead.`)
    }
    out[column] = value
  }
  return out
}

export function renderOrder(column: string, order: Order): string {
  return `${column}.${order}`
}
