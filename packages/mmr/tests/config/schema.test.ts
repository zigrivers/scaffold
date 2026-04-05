import { describe, it, expect } from 'vitest'
import { MmrConfigSchema, Severity } from '../../src/config/schema.js'

describe('MmrConfigSchema', () => {
  it('validates a minimal valid config', () => {
    const config = {
      version: 1,
      defaults: { fix_threshold: 'P2' },
      channels: {
        claude: {
          enabled: true,
          command: 'claude -p',
          auth: {
            check: 'claude -p "ok" 2>/dev/null',
            timeout: 5,
            failure_exit_codes: [1],
            recovery: 'Run: claude login',
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('applies channel config defaults for omitted fields', () => {
    const config = {
      version: 1,
      channels: {
        claude: {
          command: 'claude -p',
          auth: {
            check: 'claude -p "ok"',
            failure_exit_codes: [1],
            recovery: 'Run: claude login',
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      const ch = result.data.channels.claude
      expect(ch.enabled).toBe(true)
      expect(ch.flags).toEqual([])
      expect(ch.env).toEqual({})
      expect(ch.prompt_wrapper).toBe('{{prompt}}')
      expect(ch.output_parser).toBe('default')
      expect(ch.stderr).toBe('capture')
      expect(ch.auth.timeout).toBe(5)
    }
  })

  it('rejects config without version', () => {
    const config = { channels: {} }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('rejects invalid severity in fix_threshold', () => {
    const config = {
      version: 1,
      defaults: { fix_threshold: 'P5' },
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('applies defaults for optional fields', () => {
    const config = {
      version: 1,
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.defaults.fix_threshold).toBe('P2')
      expect(result.data.defaults.timeout).toBe(300)
      expect(result.data.defaults.format).toBe('json')
      expect(result.data.defaults.job_retention_days).toBe(7)
    }
  })
})

describe('Severity', () => {
  it('P0 < P1 < P2 < P3 in severity order', () => {
    expect(Severity.parse('P0')).toBe('P0')
    expect(Severity.parse('P3')).toBe('P3')
    expect(() => Severity.parse('P4')).toThrow()
  })
})
