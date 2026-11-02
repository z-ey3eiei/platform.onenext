import { describe, expect, it } from 'vitest'
import { joinUrl, resolveConfig } from './config.ts'
import { PlatformError } from './errors.ts'

const base = { apiKey: 'pk_test', baseUrl: 'https://api.platform.onenext' }

describe('joinUrl', () => {
  it('does not double the slash', () => {
    expect(joinUrl('https://x.test/', '/rest/v1')).toBe('https://x.test/rest/v1')
  })
  it('keeps an absolute URL untouched', () => {
    expect(joinUrl('https://x.test', 'https://cdn.test/a.png')).toBe('https://cdn.test/a.png')
  })
  it('drops a trailing slash on the base', () => {
    expect(joinUrl('https://x.test/', '')).toBe('https://x.test')
  })
})

describe('resolveConfig', () => {
  it('applies documented defaults', () => {
    const config = resolveConfig(base)
    expect(config).toMatchObject({ timeoutMs: 10_000, maxRetries: 2, retryBaseDelayMs: 200, retryMaxDelayMs: 5_000 })
  })
  it('normalises the base URL', () => {
    expect(resolveConfig({ ...base, baseUrl: 'https://api.platform.onenext/' }).baseUrl).toBe(
      'https://api.platform.onenext',
    )
  })
  it('rejects an empty api key', () => {
    expect(() => resolveConfig({ ...base, apiKey: '  ' })).toThrowError(/apiKey is required/)
  })
  it('rejects a relative base URL instead of failing at request time', () => {
    expect(() => resolveConfig({ ...base, baseUrl: 'api.platform.onenext' })).toThrowError(/absolute URL/)
  })
  it('rejects a non-http protocol', () => {
    expect(() => resolveConfig({ ...base, baseUrl: 'ftp://x.test' })).toThrowError(/must be http\(s\)/)
  })
  it('throws PlatformError so callers can match on code', () => {
    try {
      resolveConfig({ ...base, apiKey: '' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(PlatformError)
      expect((error as PlatformError).code).toBe('invalid_config')
    }
  })
  it('lets the caller shorten the timeout', () => {
    expect(resolveConfig({ ...base, timeoutMs: 50 }).timeoutMs).toBe(50)
  })
})
