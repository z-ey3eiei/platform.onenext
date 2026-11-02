/**
 * Query serialisation shared by every module. Arrays become comma lists because
 * that is what a PostgREST-style backend expects (`in.(a,b)`).
 */
export type QueryValue = string | number | boolean | null | Date | readonly (string | number | boolean)[]

export type QueryInput = Record<string, QueryValue | undefined>

export function serializeQuery(query: QueryInput): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    if (value === null) {
      params.append(key, 'null')
    } else if (Array.isArray(value)) {
      params.append(key, value.join(','))
    } else if (value instanceof Date) {
      params.append(key, value.toISOString())
    } else {
      params.append(key, String(value))
    }
  }
  return params.toString()
}
