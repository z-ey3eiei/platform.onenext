import { PlatformError } from './errors.ts'

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
}

export interface ClientConfig {
  /** Project API key. Sent as `Authorization: Bearer <apiKey>`. */
  apiKey: string
  /** e.g. https://api.platform.onenext */
  baseUrl: string
  /** Abort a request when the server never answers. Default 10000. */
  timeoutMs?: number | undefined
  /** Retries after the first attempt. Default 2. */
  maxRetries?: number | undefined
  retryBaseDelayMs?: number | undefined
  retryMaxDelayMs?: number | undefined
  logger?: Logger | undefined
  /** Inject fetch (tests, Node polyfills, agents that proxy egress). */
  fetch?: typeof fetch | undefined
  /** Override for multi-tenant deployments. */
  projectId?: string | undefined
  userAgent?: string | undefined
}

export interface ResolvedConfig extends ClientConfig {
  timeoutMs: number
  maxRetries: number
  retryBaseDelayMs: number
  retryMaxDelayMs: number
  baseUrl: string
}

/** Join base + path without doubling or dropping the slash. */
export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  if (!trimmedPath) return trimmedBase
  return `${trimmedBase}/${trimmedPath}`
}

/** Fail fast and loudly: a silent typo in baseUrl/apiKey is the worst outcome. */
export function resolveConfig(config: ClientConfig): ResolvedConfig {
  if (typeof config !== 'object' || config === null) {
    throw new PlatformError({ code: 'invalid_config', message: 'createClient expects a config object' })
  }
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    throw new PlatformError({ code: 'invalid_config', message: 'config.apiKey is required and must not be empty' })
  }
  let parsed: URL
  try {
    parsed = new URL(config.baseUrl)
  } catch {
    throw new PlatformError({
      code: 'invalid_config',
      message: `config.baseUrl must be an absolute URL including protocol, got "${config.baseUrl}"`,
    })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PlatformError({ code: 'invalid_config', message: `config.baseUrl must be http(s), got "${parsed.protocol}"` })
  }

  return {
    ...config,
    baseUrl: parsed.toString().replace(/\/+$/, ''),
    timeoutMs: config.timeoutMs ?? 10_000,
    maxRetries: config.maxRetries ?? 2,
    retryBaseDelayMs: config.retryBaseDelayMs ?? 200,
    retryMaxDelayMs: config.retryMaxDelayMs ?? 5_000,
  }
}
