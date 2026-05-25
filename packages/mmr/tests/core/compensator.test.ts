import { describe, it, expect } from 'vitest'
import { getCompensatingChannels, resolveCompensatorDispatch } from '../../src/core/compensator.js'
import type { MmrConfigParsed } from '../../src/config/schema.js'
import type { ChannelStatus } from '../../src/types.js'

describe('getCompensatingChannels', () => {
  it('returns compensating channels for unavailable ones', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      codex: 'not_installed',
      gemini: 'auth_failed',
    }
    const result = getCompensatingChannels(statuses)
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
    const result = getCompensatingChannels(statuses)
    expect(result).toHaveLength(0)
  })

  it('does not compensate for claude (would be self-review)', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'auth_failed',
      codex: 'completed',
    }
    const result = getCompensatingChannels(statuses)
    expect(result).toHaveLength(0) // claude skipped, codex completed
  })

  it('includes focus prompt for known channels', () => {
    const statuses: Record<string, ChannelStatus> = { codex: 'not_installed' }
    const result = getCompensatingChannels(statuses)
    expect(result[0].focusPrompt).toContain('security')
    expect(result[0].focusPrompt).toContain('implementation correctness')
  })

  it('generates generic focus for unknown channels', () => {
    const statuses: Record<string, ChannelStatus> = { 'custom-tool': 'timeout' as ChannelStatus }
    const result = getCompensatingChannels(statuses)
    expect(result[0].focusPrompt).toContain('custom-tool')
    expect(result[0].compensatingName).toBe('compensating-custom-tool')
  })

  it('compensates for timed-out and skipped channels', () => {
    const statuses: Record<string, ChannelStatus> = {
      codex: 'timeout',
      gemini: 'skipped',
    }
    const result = getCompensatingChannels(statuses)
    expect(result).toHaveLength(2)
  })

  it('compensates for failed channels', () => {
    const statuses: Record<string, ChannelStatus> = {
      claude: 'completed',
      codex: 'failed',
    }
    const result = getCompensatingChannels(statuses)
    expect(result).toHaveLength(1)
    expect(result[0].originalChannel).toBe('codex')
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
    },
    channels: {},
  }

  it('returns the hardcoded claude default when no compensator block is set', () => {
    const result = resolveCompensatorDispatch(baseConfig, 'codex')
    expect(result.command).toBe('claude -p')
    expect(result.flags).toEqual(['--output-format', 'json'])
    expect(result.env).toEqual({})
    expect(result.stderr).toBe('capture')
    expect(result.output_parser).toBe('default')
  })

  it('uses the configured channel when defaults.compensator.channel is set', () => {
    const cfg: MmrConfigParsed = {
      ...baseConfig,
      defaults: { ...baseConfig.defaults, compensator: { channel: 'qwen-local' } },
      channels: {
        'qwen-local': {
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
    const result = resolveCompensatorDispatch(cfg, 'codex')
    expect(result.command).toBe('ollama')
    expect(result.flags).toEqual(['run', 'qwen2.5-coder:32b'])
    expect(result.env).toEqual({ OLLAMA_HOST: 'http://localhost:11434' })
    expect(result.output_parser).toBe('default')
  })
})
