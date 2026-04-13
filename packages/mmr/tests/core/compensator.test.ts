import { describe, it, expect } from 'vitest'
import { getCompensatingChannels } from '../../src/core/compensator.js'
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
