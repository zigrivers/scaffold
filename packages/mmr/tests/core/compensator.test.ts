import { beforeEach, describe, it, expect, vi } from 'vitest'
import {
  dispatchCompensatingPasses,
  getCompensatingChannels,
  resolveCompensatorChannelName,
  resolveCompensatorDispatch,
  resolveCompensatorFocus,
} from '../../src/core/compensator.js'
import { dispatchChannel } from '../../src/core/dispatcher.js'
import type { MmrConfigParsed } from '../../src/config/schema.js'
import type { ChannelStatus } from '../../src/types.js'

vi.mock('../../src/core/dispatcher.js', () => ({
  dispatchChannel: vi.fn(() => Promise.resolve()),
}))

beforeEach(() => {
  vi.mocked(dispatchChannel).mockClear()
})

describe('getCompensatingChannels', () => {
  it('returns compensating channels for unavailable ones', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      codex: 'not_installed',
      gemini: 'auth_failed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result).toHaveLength(2)
    expect(result.map(c => c.compensatingName)).toContain('compensating-codex')
    expect(result.map(c => c.compensatingName)).toContain('compensating-gemini')
  })

  it('does not compensate for completed channels', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      codex: 'completed',
      gemini: 'completed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result).toHaveLength(0)
  })

  it('does not compensate for claude (would be self-review)', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'auth_failed',
      codex: 'completed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result).toHaveLength(0) // claude skipped, codex completed
  })

  it('does not compensate for the configured compensator channel', () => {
    const statuses: Record<string, ChannelStatus> = {
      'qwen-local': 'failed',
      claude: 'failed',
      codex: 'completed',
    }
    const result = getCompensatingChannels(statuses, 'qwen-local')
    expect(result).toHaveLength(1)
    expect(result[0].originalChannel).toBe('claude')
  })

  it('returns descriptors for known channels without resolving focus prematurely', () => {
    const statuses: Record<string, ChannelStatus> = { codex: 'not_installed' }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result[0]).toEqual({
      originalChannel: 'codex',
      compensatingName: 'compensating-codex',
    })
  })

  it('returns descriptors for unknown channels', () => {
    const statuses: Record<string, ChannelStatus> = { 'custom-tool': 'timeout' as ChannelStatus }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result[0].originalChannel).toBe('custom-tool')
    expect(result[0].compensatingName).toBe('compensating-custom-tool')
  })

  it('compensates for timed-out and skipped channels', () => {
    const statuses: Record<string, ChannelStatus> = {
      codex: 'timeout',
      gemini: 'skipped',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result).toHaveLength(2)
  })

  it('compensates for failed channels', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      codex: 'failed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result).toHaveLength(1)
    expect(result[0].originalChannel).toBe('codex')
  })

  it('compensates for an unavailable antigravity channel', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      antigravity: 'auth_failed',
    }
    const result = getCompensatingChannels(statuses, 'claude')
    expect(result.map(c => c.compensatingName)).toContain('compensating-antigravity')
  })
})

describe('resolveCompensatorDispatch', () => {
  const baseConfig: MmrConfigParsed = {
    version: 1,
    defaults: {
      fix_threshold: 'P2',
      timeout: 300,
      format: 'json',
      parallel: true,
      job_retention_days: 7,
      loop_control: {
        max_rounds_default: 5,
        repeat_suppression_enabled: false,
      },
    },
    channels: {},
  }

  it('returns the hardcoded claude default when no compensator block is set', () => {
    const result = resolveCompensatorDispatch(baseConfig)
    expect(result.command).toBe('claude')
    expect(result.flags).toEqual(['-p', '--output-format', 'json'])
    expect(result.env).toEqual({})
    expect(result.timeout).toBe(300)
    expect(result.prompt_wrapper).toBe('{{prompt}}')
    expect(result.stderr).toBe('capture')
    expect(result.output_parser).toBe('default')
  })

  it('returns the hardcoded claude default when compensator has focus overrides but no channel', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: {
        ...baseConfig.defaults,
        compensator: { channel_focus_map: { codex: 'Focus on correctness.' } },
      },
    }
    const result = resolveCompensatorDispatch(cfg)
    expect(result.command).toBe('claude')
    expect(result.flags).toEqual(['-p', '--output-format', 'json'])
    expect(result.output_parser).toBe('default')
  })

  it('uses the configured channel when defaults.compensator.channel is set', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
          kind: 'subprocess' as const,
          enabled: true,
          command: 'ollama',
          flags: ['run', 'qwen2.5-coder:32b'],
          env: { OLLAMA_HOST: 'http://localhost:11434' },
          auth: { check: 'true', timeout: 5, failure_exit_codes: [1], recovery: 'noop' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }
    const result = resolveCompensatorDispatch(cfg)
    expect(result.command).toBe('ollama')
    expect(result.flags).toEqual(['run', 'qwen2.5-coder:32b'])
    expect(result.env).toEqual({ OLLAMA_HOST: 'http://localhost:11434' })
    expect(result.timeout).toBe(300)
    expect(result.prompt_wrapper).toBe('{{prompt}}')
    expect(result.output_parser).toBe('default')
  })

  it('carries prompt_delivery from a prompt-file compensator channel (e.g. grok)', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'grok' } },
      channels: {
        grok: {
          kind: 'subprocess' as const,
          enabled: true,
          command: 'grok',
          prompt_delivery: 'prompt-file',
          flags: ['--prompt-file', '{{prompt_file}}', '--output-format', 'json'],
          env: {},
          auth: { check: 'grok models', timeout: 10, failure_exit_codes: [1], recovery: 'grok login' },
          prompt_wrapper: '{{prompt}}',
          output_parser: { kind: 'unwrap-jsonpath', wrap: '$.text', then: 'default' },
          stderr: 'capture',
          abstract: false,
        },
      },
    }
    const result = resolveCompensatorDispatch(cfg)
    // Without this, a grok compensator would get the literal {{prompt_file}} flag
    // with the prompt piped to stdin, and fail.
    expect(result.prompt_delivery).toBe('prompt-file')
  })

  it('throws when the configured compensator channel is missing', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'missing' } },
    }
    expect(() => resolveCompensatorDispatch(cfg)).toThrow('Compensator channel "missing" not found')
  })

  it('throws when the configured compensator channel has no command', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'abstract-base' } },
      channels: {
        'abstract-base': {
          kind: 'subprocess' as const,
          enabled: true,
          flags: [],
          env: {},
          auth: { check: 'true', timeout: 5, failure_exit_codes: [1], recovery: 'noop' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: true,
        },
      },
    }
    expect(() => resolveCompensatorDispatch(cfg)).toThrow(
      'Compensator channel "abstract-base" is abstract and cannot be dispatched',
    )
  })
})

describe('resolveCompensatorChannelName', () => {
  const baseConfig: MmrConfigParsed = {
    version: 1,
    defaults: {
      fix_threshold: 'P2',
      timeout: 300,
      format: 'json',
      parallel: true,
      job_retention_days: 7,
      loop_control: {
        max_rounds_default: 5,
        repeat_suppression_enabled: false,
      },
    },
    channels: {},
  }

  it('defaults to claude when no compensator channel is configured', () => {
    expect(resolveCompensatorChannelName(baseConfig)).toBe('claude')
  })

  it('returns the configured compensator channel', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
    }
    expect(resolveCompensatorChannelName(cfg)).toBe('qwen-local')
  })
})

describe('resolveCompensatorFocus', () => {
  const baseConfig: MmrConfigParsed = {
    version: 1,
    defaults: {
      fix_threshold: 'P2',
      timeout: 300,
      format: 'json',
      parallel: true,
      job_retention_days: 7,
      loop_control: {
        max_rounds_default: 5,
        repeat_suppression_enabled: false,
      },
    },
    channels: {},
  }

  it('returns the hardcoded focus when no compensator block is set', () => {
    const focus = resolveCompensatorFocus(baseConfig, 'codex')
    expect(focus).toMatch(/implementation correctness/i)
    expect(focus).toMatch(/security/i)
  })

  it('returns generic focus for unknown channels', () => {
    const focus = resolveCompensatorFocus(baseConfig, 'custom-tool')
    expect(focus).toContain('custom-tool')
  })

  it('returns the channel_focus_map override when set for the original channel', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: {
        ...baseConfig.defaults,
        compensator: {
          channel: 'qwen-local',
          channel_focus_map: { codex: 'Focus on memory safety and async correctness.' },
        },
      },
      channels: {
        'qwen-local': {
          kind: 'subprocess' as const,
          enabled: true,
          command: 'ollama',
          flags: [],
          env: {},
          auth: { check: 'true', timeout: 5, failure_exit_codes: [1], recovery: 'noop' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }
    expect(resolveCompensatorFocus(cfg, 'codex')).toBe('Focus on memory safety and async correctness.')
  })

  it('returns the Google-family focus for the antigravity channel', () => {
    const focus = resolveCompensatorFocus(baseConfig, 'antigravity')
    expect(focus).toMatch(/architectural patterns/i)
    expect(focus).toMatch(/broad-context reasoning/i)
    expect(focus).toMatch(/Antigravity/i)
  })
})

describe('dispatchCompensatingPasses honors defaults.compensator', () => {
  const baseConfig: MmrConfigParsed = {
    version: 1,
    defaults: {
      fix_threshold: 'P2',
      timeout: 300,
      format: 'json',
      parallel: true,
      job_retention_days: 7,
      loop_control: {
        max_rounds_default: 5,
        repeat_suppression_enabled: false,
      },
    },
    channels: {},
  }

  const compensating = [
    {
      originalChannel: 'codex',
      compensatingName: 'compensating-codex',
    },
  ]

  it('dispatches via claude when defaults.compensator is unset', async () => {
    await dispatchCompensatingPasses({} as never, 'job-1', 'review prompt', compensating, baseConfig)

    expect(dispatchChannel).toHaveBeenCalledWith(
      {},
      'job-1',
      'compensating-codex',
      expect.objectContaining({
        command: 'claude',
        flags: ['-p', '--output-format', 'json'],
        timeout: 300,
      }),
    )
  })

  it('dispatches via the referenced channel when defaults.compensator.channel is set', async () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
          kind: 'subprocess' as const,
          enabled: true,
          command: 'ollama',
          flags: ['run', 'qwen2.5'],
          timeout: 900,
          env: { OLLAMA_HOST: 'http://localhost:11434' },
          auth: { check: 'true', timeout: 5, failure_exit_codes: [1], recovery: 'noop' },
          prompt_wrapper: '{{prompt}}',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }

    await dispatchCompensatingPasses({} as never, 'job-1', 'review prompt', compensating, cfg)

    expect(dispatchChannel).toHaveBeenCalledWith(
      {},
      'job-1',
      'compensating-codex',
      expect.objectContaining({
        command: 'ollama',
        flags: ['run', 'qwen2.5'],
        timeout: 900,
        env: { OLLAMA_HOST: 'http://localhost:11434' },
      }),
    )
  })

  it('applies channel_focus_map and prompt_wrapper to the prompt', async () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: {
        ...baseConfig.defaults,
        compensator: {
          channel: 'qwen-local',
          channel_focus_map: { codex: 'Focus on memory safety and async correctness.' },
        },
      },
      channels: {
        'qwen-local': {
          kind: 'subprocess' as const,
          enabled: true,
          command: 'ollama',
          flags: [],
          env: {},
          auth: { check: 'true', timeout: 5, failure_exit_codes: [1], recovery: 'noop' },
          prompt_wrapper: 'SYSTEM\n{{prompt}}\nEND',
          output_parser: 'default',
          stderr: 'capture',
          abstract: false,
        },
      },
    }

    await dispatchCompensatingPasses({} as never, 'job-1', 'review prompt', compensating, cfg)

    expect(vi.mocked(dispatchChannel).mock.calls[0][3].prompt)
      .toBe('SYSTEM\nFocus on memory safety and async correctness.\n\nreview prompt\nEND')
  })
})
