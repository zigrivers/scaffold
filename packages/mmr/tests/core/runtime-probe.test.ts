import { describe, it, expect } from 'vitest'
import { probeRuntime } from '../../src/core/runtime-probe.js'

describe('probeRuntime (T1-D)', () => {
  it('returns detected=true when the command exists on PATH', async () => {
    const result = await probeRuntime(process.execPath, ['--version'], 1000)
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
    const result = await probeRuntime(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      200,
    )
    expect(result.detected).toBe(false)
    expect(result.reason).toMatch(/timeout/i)
  })

  it('returns detected=false when command name contains unsafe characters', async () => {
    const result = await probeRuntime('bad name; rm -rf /', [], 1000)
    expect(result.detected).toBe(false)
    expect(result.reason).toMatch(/invalid/i)
  })

  it('returns detected=false when timeout is outside the safe timer range', async () => {
    const result = await probeRuntime(process.execPath, ['--version'], 2_147_483_648)
    expect(result.detected).toBe(false)
    expect(result.reason).toBe('invalid timeout')
  })

  it('returns detected=false when an argument contains a NUL byte', async () => {
    const result = await probeRuntime(process.execPath, ['bad\0arg'], 1000)
    expect(result.detected).toBe(false)
    expect(result.reason).toMatch(/argument/i)
  })
})
