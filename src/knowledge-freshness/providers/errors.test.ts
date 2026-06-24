import { describe, it, expect } from 'vitest'
import { DispatcherError, isRetryableHttpStatus } from './errors.js'

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
