import { describe, it, expect, vi } from 'vitest'
import { ANTHROPIC_COMMAND, buildAnthropicDispatcher } from './anthropic.js'

describe('anthropic provider', () => {
  it('exports the exact hardcoded command (decision #7 invariant)', () => {
    // The command MUST be literal — never read from project config — so the
    // threat model from the parent design's decision #7 holds. This test
    // acts as a tripwire if a future contributor introduces a templated
    // command string.
    expect(ANTHROPIC_COMMAND).toBe('claude -p --tools ""')
  })

  it('builds a Dispatcher that calls dispatchLlm with the hardcoded command + timeout', async () => {
    // We can't run a real subprocess in unit tests; we mock dispatchLlm at
    // the module level. The mock returns the full DispatchResult shape
    // (`parsed: unknown` on success, `raw?: string` on failure) so the
    // production typeof-derived DispatchLlmFn signature is satisfied.
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: true, raw: 'verdict json here', parsed: undefined })
    const dispatcher = buildAnthropicDispatcher({ timeoutSec: 600, dispatchLlmFn: dispatchSpy })
    const result = await dispatcher('hello world')
    expect(dispatchSpy).toHaveBeenCalledWith({
      prompt: 'hello world',
      command: 'claude -p --tools ""',
      timeoutMs: 600_000,
    })
    expect(result).toBe('verdict json here')
  })

  it('throws with the dispatcher reason verbatim when dispatchLlm fails', async () => {
    const dispatchSpy = vi.fn().mockResolvedValue({ ok: false, reason: 'subprocess exit 127' })
    const dispatcher = buildAnthropicDispatcher({ timeoutSec: 60, dispatchLlmFn: dispatchSpy })
    await expect(dispatcher('x')).rejects.toThrow(/subprocess exit 127/)
  })
})
