import { describe, it, expect } from 'vitest'
import { probeRuntime } from '../../src/core/runtime-probe.js'

describe('probeRuntime (T1-D)', () => {
  it('returns detected=true when the command exists on PATH', async () => {
    // `sh` is guaranteed present on POSIX systems where these tests run.
    const result = await probeRuntime('sh', ['-c', 'exit 0'], 1000)
    expect(result.detected).toBe(true)
  })

  it('returns detected=false when the command is missing', async () => {
    const result = await probeRuntime(
      'definitely-not-a-real-binary-name-1234',
      ['--version'],
      1000,
    )
    expect(result.detected).toBe(false)
  })

  it('returns detected=false when the probe exceeds timeout', async () => {
    // `sleep 5` won't exit within a 200ms timeout.
    const result = await probeRuntime('sleep', ['5'], 200)
    expect(result.detected).toBe(false)
    expect(result.reason).toMatch(/timeout/i)
  })

  it('returns detected=false when command name contains unsafe characters', async () => {
    const result = await probeRuntime('bad name; rm -rf /', [], 1000)
    expect(result.detected).toBe(false)
    expect(result.reason).toMatch(/invalid/i)
  })
})
