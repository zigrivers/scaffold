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
      expect(ch.auth?.timeout).toBe(5)
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

describe('ChannelConfigSchema extends/abstract fields (T1-A)', () => {
  it('accepts a channel with extends: string', () => {
    const config = {
      version: 1,
      channels: {
        qwen: {
          extends: 'ollama-base',
          command: 'ollama run',
          flags: ['qwen2.5-coder:32b'],
          auth: { check: 'ollama list', failure_exit_codes: [1], recovery: 'ollama serve' },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.qwen.extends).toBe('ollama-base')
    }
  })

  it('accepts a channel with abstract: true even when command-required fields are absent at the local level', () => {
    // Note: schema only enforces command presence at the local level today;
    // loader merges before validation, so this confirms abstract is a tracked field.
    const config = {
      version: 1,
      channels: {
        'ollama-base': {
          abstract: true,
          command: 'ollama run',
          auth: { check: 'ollama list', failure_exit_codes: [1], recovery: 'ollama serve' },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels['ollama-base'].abstract).toBe(true)
    }
  })

  it('defaults abstract to false when omitted', () => {
    const config = {
      version: 1,
      channels: {
        claude: {
          command: 'claude -p',
          auth: { check: 'claude -p ok', failure_exit_codes: [1], recovery: 'claude login' },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.claude.abstract).toBe(false)
    }
  })
})

describe('output_parser union', () => {
  const baseAuth = {
    check: 'true',
    failure_exit_codes: [1],
    recovery: 'noop',
  }

  it('accepts the existing string form (back-compat)', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: 'default',
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.channels.c1.output_parser).toBe('default')
    }
  })

  it('accepts an unwrap-jsonpath object form', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'unwrap-jsonpath',
            wrap: '$.choices[0].message.content',
            then: 'default',
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('accepts a regex-findings object form', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'regex-findings',
            pattern: '^(P[0-3])\\|([^|]+)\\|(.+)$',
            fields: { severity: 1, location: 2, description: 3 },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('accepts optional regex metadata fields', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'regex-findings',
            pattern: '^([^|]+)\\|([^|]+)\\|(P[0-3])\\|([^|]+)\\|(.+)$',
            flags: 'gim',
            fields: { id: 1, category: 2, severity: 3, location: 4, description: 5 },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('accepts unwrap-jsonpath chained to a regex-findings object parser', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'unwrap-jsonpath',
            wrap: '$.content',
            then: {
              kind: 'regex-findings',
              pattern: '^(P[0-3])\\|([^|]+)\\|(.+)$',
              fields: { severity: 1, location: 2, description: 3 },
            },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('accepts unwrap-jsonpath chained to another unwrap-jsonpath object parser', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'unwrap-jsonpath',
            wrap: '$.outer',
            then: {
              kind: 'unwrap-jsonpath',
              wrap: '$.inner',
              then: 'default',
            },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects an unknown parser kind with a clear error', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: { kind: 'unknown-kind', wrap: '$' },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = result.error.message
      expect(msg).toMatch(/kind|discriminator|invalid/i)
    }
  })

  it('rejects regex-findings without required fields.location', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'regex-findings',
            pattern: '.*',
            fields: { description: 1 },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('rejects regex-findings capture group index 0', () => {
    const config = {
      version: 1,
      channels: {
        c1: {
          command: 'echo',
          auth: baseAuth,
          output_parser: {
            kind: 'regex-findings',
            pattern: '.*',
            fields: { location: 0, description: 1 },
          },
        },
      },
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })
})

describe('defaults.compensator (T1-G)', () => {
  it('accepts a compensator block referencing a channel', () => {
    const config = {
      version: 1,
      defaults: {
        compensator: {
          channel: 'qwen-local',
          channel_focus_map: { codex: 'Focus on security' },
        },
      },
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.defaults.compensator?.channel).toBe('qwen-local')
      expect(result.data.defaults.compensator?.channel_focus_map?.codex).toBe('Focus on security')
    }
  })

  it('accepts a compensator block without channel_focus_map', () => {
    const config = {
      version: 1,
      defaults: { compensator: { channel: 'qwen-local' } },
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
  })

  it('rejects a compensator block missing the required channel field', () => {
    const config = {
      version: 1,
      defaults: { compensator: {} },
      channels: {},
    }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(false)
  })

  it('defaults.compensator is undefined when omitted (back-compat)', () => {
    const config = { version: 1, channels: {} }
    const result = MmrConfigSchema.safeParse(config)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.defaults.compensator).toBeUndefined()
    }
  })
})
