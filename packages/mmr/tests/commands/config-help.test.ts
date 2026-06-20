import { describe, expect, it } from 'vitest'

describe('config command help examples', () => {
  it('includes the canonical disable, show, and path examples', async () => {
    const { CONFIG_EXAMPLES } = await import('../../src/commands/config.js')
    const cmds = CONFIG_EXAMPLES.map((e) => e[0])
    expect(cmds).toContain('mmr config disable grok')
    expect(cmds).toContain('mmr config channels show codex')
    expect(cmds).toContain('mmr config path')
  })
})
