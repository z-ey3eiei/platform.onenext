/**
 * Every failure the SDK reports is a PlatformError. HTTP failures are returned
 * in the `{ data, error }` envelope instead of thrown, so callers can branch
 * without try/catch; only programmer mistakes (bad config) throw.
 */

export type PlatformErrorCode =
  | 'invalid_config'
  | 'invalid_query'
  | 'not_implemented'
  | 'network_error'
  | 'timeout'
  | 'aborted'
  | 'bad_response'
  | 'http_error'
  | (string & {})

export interface PlatformErrorOptions {
  code: PlatformErrorCode
  message: string
  status?: number | undefined
  requestId?: string | undefined
  details?: unknown
  cause?: unknown
  retryable?: boolean
}

export class PlatformError extends Error {
  readonly code: PlatformErrorCode
  readonly status?: number | undefined
  readonly requestId?: string | undefined
  readonly details?: unknown
  readonly retryable: boolean

  constructor(options: PlatformErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'PlatformError'
    this.code = options.code
    this.status = options.status
    this.requestId = options.requestId
    this.details = options.details
    this.retryable = options.retryable ?? false
  }

  /** Safe to log: never includes the API key. */
  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      status: this.status,
      requestId: this.requestId,
      retryable: this.retryable,
    }
  }
}

export class ApiError extends PlatformError {
  readonly httpStatus: number

  constructor(options: Omit<PlatformErrorOptions, 'status'> & { status: number }) {
    super(options)
    this.name = 'ApiError'
    this.httpStatus = options.status
  }
}

/** Narrowing helper so callers do not have to import the class to branch. */
export function isPlatformError(value: unknown): value is PlatformError {
  return value instanceof PlatformError ||
    (typeof value === 'object' && value !== null && (value as { name?: string }).name === 'PlatformError')
}
