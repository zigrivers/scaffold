import { describe, it, expect } from 'vitest'
import { resolveCompensatorDispatch } from '../../src/core/compensator.js'

describe('compensator — cwd inheritance', () => {
  it('carries the configured grok channel cwd into the dispatch', () => {
    const config = {
      version: 1,
      defaults: { compensator: { channel: 'grok' }, timeout: 300 },
      channels: {
        grok: {
          kind: 'subprocess', command: 'grok',
          flags: ['--no-memory'], env: { HOME: '{{neutral_home}}' },
          cwd: '{{neutral_cwd}}', stderr: 'capture',
          prompt_wrapper: '{{prompt}}', output_parser: 'default',
          prompt_delivery: 'prompt-file', enabled: true, abstract: false,
        },
      },
    } as never
    const d = resolveCompensatorDispatch(config)
    expect(d.cwd).toBe('{{neutral_cwd}}')
    expect(d.env.HOME).toBe('{{neutral_home}}')
    expect(d.flags).toContain('--no-memory')
  })
})
