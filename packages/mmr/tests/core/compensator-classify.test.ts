import { describe, it, expect } from 'vitest'
import { getCompensatingChannels } from '../../src/core/compensator.js'
import type { ChannelStatus } from '../../src/types.js'

describe('getCompensatingChannels — structural vs transient (C1)', () => {
  it('does not compensate a structurally-absent (not_installed) channel by default', () => {
    const out = getCompensatingChannels(
      { grok: 'not_installed' as ChannelStatus, codex: 'auth_failed' as ChannelStatus },
      'claude',
    )
    expect(out.map((c) => c.originalChannel)).toEqual(['codex'])
  })

  it('still compensates transient statuses (auth_failed/timeout/failed)', () => {
    const out = getCompensatingChannels(
      { a: 'auth_failed' as ChannelStatus, b: 'timeout' as ChannelStatus, c: 'failed' as ChannelStatus },
      'claude',
    )
    expect(out.map((c) => c.originalChannel).sort()).toEqual(['a', 'b', 'c'])
  })

  it('compensates not_installed when --compensate-missing is set', () => {
    const out = getCompensatingChannels(
      { grok: 'not_installed' as ChannelStatus },
      'claude',
      { compensateMissing: true },
    )
    expect(out.length).toBe(1)
  })

  it('compensates not_installed when the channel is marked required', () => {
    const out = getCompensatingChannels(
      { grok: 'not_installed' as ChannelStatus },
      'claude',
      { compensateMissing: false, channels: { grok: { required: true } } },
    )
    expect(out.length).toBe(1)
  })

  it('never compensates the compensator channel itself', () => {
    const out = getCompensatingChannels({ claude: 'failed' as ChannelStatus }, 'claude')
    expect(out).toEqual([])
  })
})
