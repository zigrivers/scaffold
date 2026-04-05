import { describe, it, expect } from 'vitest'
import { checkAuth, checkInstalled } from '../../src/core/auth.js'

describe('checkInstalled', () => {
  it('returns true for a command that exists', async () => {
    const result = await checkInstalled('node')
    expect(result).toBe(true)
  })

  it('returns false for a command that does not exist', async () => {
    const result = await checkInstalled('nonexistent-binary-xyz-123')
    expect(result).toBe(false)
  })
})

describe('checkAuth', () => {
  it('returns ok for a command that exits 0', async () => {
    const result = await checkAuth({
      enabled: true,
      command: 'echo',
      flags: [],
      env: {},
      auth: {
        check: 'true',
        timeout: 5,
        failure_exit_codes: [1],
        recovery: 'do something',
      },
      prompt_wrapper: '{{prompt}}',
      output_parser: 'default',
      stderr: 'capture',
    })
    expect(result.status).toBe('ok')
  })

  it('returns failed when exit code matches failure_exit_codes', async () => {
    const result = await checkAuth({
      enabled: true,
      command: 'echo',
      flags: [],
      env: {},
      auth: {
        check: 'exit 1',
        timeout: 5,
        failure_exit_codes: [1],
        recovery: 'Run: reauth',
      },
      prompt_wrapper: '{{prompt}}',
      output_parser: 'default',
      stderr: 'capture',
    })
    expect(result.status).toBe('failed')
    expect(result.recovery).toBe('Run: reauth')
  })

  it('returns timeout when auth check exceeds timeout', async () => {
    const result = await checkAuth({
      enabled: true,
      command: 'echo',
      flags: [],
      env: {},
      auth: {
        check: 'sleep 10',
        timeout: 1,
        failure_exit_codes: [1],
        recovery: 'do something',
      },
      prompt_wrapper: '{{prompt}}',
      output_parser: 'default',
      stderr: 'capture',
    })
    expect(result.status).toBe('timeout')
  })
})
