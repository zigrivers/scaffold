import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildFallbackDispatcher } from './fallback.js'
import { DispatcherError } from './errors.js'
import type { Dispatcher } from '../audit-runner.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildFallbackDispatcher', () => {
  it('returns the primary result and never calls the secondary when primary succeeds', async () => {
    const primary: Dispatcher = vi.fn(async () => 'primary-result')
    const secondary: Dispatcher = vi.fn(async () => 'secondary-result')
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    const result = await dispatcher('prompt')
    expect(result).toBe('primary-result')
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).not.toHaveBeenCalled()
  })

  it('calls the secondary and returns its result when the primary throws a retryable error', async () => {
    const primary: Dispatcher = vi.fn(async () => {
      throw new DispatcherError('zai dispatcher: HTTP 429', { retryable: true })
    })
    const secondary: Dispatcher = vi.fn(async () => 'secondary-result')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    const result = await dispatcher('prompt')
    expect(result).toBe('secondary-result')
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).toHaveBeenCalledOnce()
    // The fallback must be visible in cron logs (stderr), naming both
    // providers and the primary's failure reason.
    expect(errorSpy).toHaveBeenCalledOnce()
    const logged = errorSpy.mock.calls[0].join(' ')
    expect(logged).toMatch(/fallback/i)
    expect(logged).toMatch(/zai/)
    expect(logged).toMatch(/deepseek/)
    expect(logged).toMatch(/HTTP 429/)
  })

  it('falls back when the primary throws a plain (unclassified) error', async () => {
    // A non-DispatcherError (e.g. an unexpected runtime throw) is treated as
    // retryable by default so we never lose the fallback safety net on an
    // error shape we did not anticipate.
    const primary: Dispatcher = vi.fn(async () => { throw new Error('boom') })
    const secondary: Dispatcher = vi.fn(async () => 'secondary-result')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    expect(await dispatcher('prompt')).toBe('secondary-result')
    expect(secondary).toHaveBeenCalledOnce()
  })

  it('does NOT fall back when the primary throws a non-retryable error', async () => {
    // A permanent primary misconfiguration (bad key → 401/403, malformed
    // request → 400) must fail the run loudly rather than silently running
    // the whole cron on the fallback provider — otherwise a broken primary
    // is never surfaced to the operator.
    const primary: Dispatcher = vi.fn(async () => {
      throw new DispatcherError('zai dispatcher: HTTP 401 unauthorized', { retryable: false })
    })
    const secondary: Dispatcher = vi.fn(async () => 'secondary-result')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    await expect(dispatcher('prompt')).rejects.toThrow(/HTTP 401 unauthorized/)
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('passes the same prompt to the secondary', async () => {
    const primary: Dispatcher = vi.fn(async () => { throw new Error('boom') })
    const secondary: Dispatcher = vi.fn(async () => 'ok')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    await dispatcher('the exact prompt')
    expect(secondary).toHaveBeenCalledWith('the exact prompt')
  })

  it('throws a combined error naming both providers when both fail', async () => {
    const primary: Dispatcher = vi.fn(async () => {
      throw new DispatcherError('zai dispatcher: HTTP 500', { retryable: true })
    })
    const secondary: Dispatcher = vi.fn(async () => {
      throw new DispatcherError('deepseek dispatcher: HTTP 503', { retryable: true })
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    // Invoke ONCE and assert every required substring against the single
    // resulting error — the combined message must surface BOTH failures so
    // the operator can triage without re-running.
    const err = await dispatcher('prompt').then(
      () => { throw new Error('expected rejection') },
      (e: unknown) => e as Error,
    )
    expect(err.message).toMatch(/zai/)
    expect(err.message).toMatch(/HTTP 500/)
    expect(err.message).toMatch(/deepseek/)
    expect(err.message).toMatch(/HTTP 503/)
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).toHaveBeenCalledOnce()
  })
})
