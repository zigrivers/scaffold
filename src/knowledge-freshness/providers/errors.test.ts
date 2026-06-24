import { describe, it, expect } from 'vitest'
import { DispatcherError, isRetryableHttpStatus, describeFetchError } from './errors.js'

describe('DispatcherError', () => {
  it('carries the retryable flag and message', () => {
    const e = new DispatcherError('zai dispatcher: HTTP 401', { retryable: false })
    expect(e).toBeInstanceOf(Error)
    expect(e.message).toBe('zai dispatcher: HTTP 401')
    expect(e.retryable).toBe(false)
    expect(e.name).toBe('DispatcherError')
  })
})

describe('isRetryableHttpStatus', () => {
  it('treats permanent client misconfigurations (400/401/403/404) as non-retryable', () => {
    // A bad/missing key or malformed request cannot be fixed by failing over
    // to a second provider, and a silent failover hides the misconfiguration.
    for (const status of [400, 401, 403, 404]) {
      expect(isRetryableHttpStatus(status)).toBe(false)
    }
  })

  it('treats rate-limit (429) and request-timeout (408) as retryable', () => {
    expect(isRetryableHttpStatus(429)).toBe(true)
    expect(isRetryableHttpStatus(408)).toBe(true)
  })

  it('treats 5xx server errors as retryable', () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isRetryableHttpStatus(status)).toBe(true)
    }
  })
})

describe('describeFetchError', () => {
  it('unwraps an Error cause that carries a code (the undici transport shape)', () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.z.ai'), { code: 'ENOTFOUND' })
    const outer = Object.assign(new TypeError('fetch failed'), { cause })
    expect(describeFetchError(outer)).toBe('fetch failed (ENOTFOUND: getaddrinfo ENOTFOUND api.z.ai)')
  })

  it('unwraps an Error cause without a code', () => {
    const cause = new Error('socket hang up')
    const outer = Object.assign(new TypeError('fetch failed'), { cause })
    expect(describeFetchError(outer)).toBe('fetch failed (socket hang up)')
  })

  it('appends a string cause', () => {
    const outer = Object.assign(new TypeError('fetch failed'), { cause: 'boom' })
    expect(describeFetchError(outer)).toBe('fetch failed (boom)')
  })

  it('returns the bare message when there is no cause', () => {
    expect(describeFetchError(new Error('plain failure'))).toBe('plain failure')
  })

  it('stringifies a non-Error throw', () => {
    expect(describeFetchError('not an error')).toBe('not an error')
  })
})
