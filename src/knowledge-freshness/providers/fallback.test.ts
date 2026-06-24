import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildFallbackDispatcher } from './fallback.js'
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

  it('calls the secondary and returns its result when the primary throws', async () => {
    const primary: Dispatcher = vi.fn(async () => { throw new Error('zai dispatcher: HTTP 429') })
    const secondary: Dispatcher = vi.fn(async () => 'secondary-result')
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    const result = await dispatcher('prompt')
    expect(result).toBe('secondary-result')
    expect(primary).toHaveBeenCalledOnce()
    expect(secondary).toHaveBeenCalledOnce()
    // The fallback must be visible in cron logs (stderr), naming both
    // providers and the primary's failure reason.
    expect(warn).toHaveBeenCalledOnce()
    const logged = warn.mock.calls[0].join(' ')
    expect(logged).toMatch(/fallback/i)
    expect(logged).toMatch(/zai/)
    expect(logged).toMatch(/deepseek/)
    expect(logged).toMatch(/HTTP 429/)
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
    const primary: Dispatcher = vi.fn(async () => { throw new Error('zai dispatcher: HTTP 500') })
    const secondary: Dispatcher = vi.fn(async () => { throw new Error('deepseek dispatcher: HTTP 503') })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const dispatcher = buildFallbackDispatcher({
      primary, secondary, primaryName: 'zai', secondaryName: 'deepseek',
    })
    const call = dispatcher('prompt')
    // The combined error must surface BOTH failure reasons so the operator
    // can triage without re-running.
    await expect(call).rejects.toThrow(/zai/)
    await expect(dispatcher('prompt')).rejects.toThrow(/HTTP 500/)
    await expect(dispatcher('prompt')).rejects.toThrow(/deepseek/)
    await expect(dispatcher('prompt')).rejects.toThrow(/HTTP 503/)
  })
})
