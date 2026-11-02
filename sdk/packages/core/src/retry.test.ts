import { describe, expect, it, vi } from 'vitest'
import {
  backoffDelayMs,
  isRetryableMethod,
  isRetryableStatus,
  retryDelayFromHeaders,
  sleep,
} from './retry.ts'

describe('isRetryableStatus', () => {
  it.each([408, 409, 425, 429, 500, 502, 503, 504, 522, 524])('retries %i', (status) => {
    expect(isRetryableStatus(status)).toBe(true)
  })
  it.each([400, 401, 403, 404, 422])('does not retry %i', (status) => {
    expect(isRetryableStatus(status)).toBe(false)
  })
})

describe('isRetryableMethod', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'])('treats %s as idempotent', (method) => {
    expect(isRetryableMethod(method)).toBe(true)
  })
  it('will not retry POST without a key', () => {
    expect(isRetryableMethod('POST')).toBe(false)
  })
  it('retries POST once an idempotency key is present', () => {
    expect(isRetryableMethod('POST', true)).toBe(true)
  })
})

describe('backoffDelayMs', () => {
  const policy = { baseDelayMs: 100, maxDelayMs: 1_000 }
  it('grows exponentially with the attempt', () => {
    expect(backoffDelayMs(0, { ...policy, random: () => 1 })).toBe(100)
    expect(backoffDelayMs(3, { ...policy, random: () => 1 })).toBe(800)
  })
  it('caps at maxDelayMs', () => {
    expect(backoffDelayMs(10, { ...policy, random: () => 1 })).toBe(1_000)
  })
  it('applies full jitter, so it can be as low as zero', () => {
    expect(backoffDelayMs(4, { ...policy, random: () => 0 })).toBe(0)
  })
})

describe('retryDelayFromHeaders', () => {
  it('honours retry-after in seconds', () => {
    expect(retryDelayFromHeaders(new Headers({ 'retry-after': '2' }), 50)).toBe(2_000)
  })
  it('honours an HTTP date in the past as zero', () => {
    const headers = new Headers({ 'retry-after': new Date(Date.now() - 5_000).toUTCString() })
    expect(retryDelayFromHeaders(headers, 50)).toBe(0)
  })
  it('falls back when the header is missing or garbage', () => {
    expect(retryDelayFromHeaders(new Headers(), 50)).toBe(50)
    expect(retryDelayFromHeaders(new Headers({ 'retry-after': 'soon' }), 50)).toBe(50)
  })
})

describe('sleep', () => {
  it('resolves immediately for non-positive delays', async () => {
    await expect(sleep(0)).resolves.toBeUndefined()
  })
  it('waits roughly the requested time', async () => {
    const started = Date.now()
    await sleep(30)
    expect(Date.now() - started).toBeGreaterThanOrEqual(20)
  })
  it('rejects when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(sleep(1_000, controller.signal)).rejects.toThrow(/Abort/)
  })
  it('rejects when aborted mid-wait', async () => {
    const controller = new AbortController()
    const pending = sleep(1_000, controller.signal)
    setTimeout(() => controller.abort(), 5)
    await expect(pending).rejects.toThrow(/Abort/)
  })
  it('does not leak the abort listener after a normal resolve', async () => {
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')
    await sleep(1, controller.signal)
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
